---
title: "RAG lên production: kỹ thuật tối ưu, đánh giá bằng RAGAS và LLMOps"
date: "2026-10-25"
tags: ["rag", "evaluation", "llmops"]
summary: "Từng giai đoạn của pipeline RAG có những kỹ thuật nào, khi nào nên dùng, khi nào nên dừng, và đo bằng gì để biết."
---

# RAG lên production: kỹ thuật tối ưu, đánh giá bằng RAGAS và LLMOps

Trên bảng trắng, RAG chỉ có ba mũi tên: embed → retrieve → generate. Bài 2 của series
đã dựng đúng ba mũi tên đó bằng LangChain, và nó chạy. Vấn đề là nó chạy *trên demo*.
Khi người dùng thật hỏi bằng từ ngữ thật, trên dữ liệu thật và với ngân sách thật, bản
"ngây thơ" đó sụp đổ trong im lặng: context (phần văn bản đưa cho mô hình) phình to,
chunk trùng nhau, độ trễ p95 (thời gian phản hồi của 5% request chậm nhất) lên 8 giây,
hóa đơn API khó đoán, và những câu trả lời nghe rất trôi chảy nhưng không bám vào bằng
chứng nào.

Quan sát của tôi sau nhiều hệ thống: phần lớn RAG không thất bại vì retrieval "tệ". Chúng
thất bại vì không ai tối ưu *toàn bộ* pipeline, và không ai đo. Bài này đi qua từng giai
đoạn, nói bản chất của từng kỹ thuật (cơ chế và vì sao nó hiệu quả), khi nào đáng dùng,
khi nào nên dừng, rồi đến cách đo bằng RAGAS và cách vận hành (LLMOps). Hai công thức
đáng ghim lên bàn: **RAG quality = Retrieval × Context × Generation**, và **Production =
Quality + Latency + Cost + Reliability**. Dấu nhân ở công thức đầu là cố ý: một thừa số
bằng 0 thì tích bằng 0, không bù được bằng hai thừa số còn lại.

## 1. RAG hỏng ở đâu

Trước khi nói kỹ thuật, cần gọi đúng tên triệu chứng. Mỗi triệu chứng dưới đây thường
trỏ về một giai đoạn cụ thể, và đó là lý do bài này tổ chức theo giai đoạn.

| Triệu chứng | Giai đoạn hay gây ra |
|---|---|
| Bảng trong PDF biến thành chuỗi chữ vô nghĩa | Parsing |
| Chunk cắt giữa câu, mất tiêu đề mục | Chunking |
| Hỏi "lỗi 429" nhưng tìm ra đoạn nói về "giới hạn tần suất" | Retrieval (vocabulary mismatch) |
| Câu hỏi cần ghép 2 tài liệu, chỉ tìm được 1 | Query side (multi-hop) |
| Đúng đoạn nằm ở vị trí 8 trong 10 chunk, mô hình bỏ qua | Context (ordering) |
| Trả lời rất tự tin, không có trong tài liệu | Generation (grounding) |
| Trả lời theo chính sách cũ đã bị thay | Freshness (re-indexing) |
| Người dùng A thấy tài liệu của phòng ban B | Metadata / permissions |
| p95 = 8 giây, chi phí tăng theo độ dài context | Latency và cost |

Hai loại lỗi đáng chú ý nhất vì chúng không lộ ra trên demo. Thứ nhất là **vocabulary
mismatch**: người hỏi dùng từ khác với tài liệu ("nghỉ phép" vs "ngày nghỉ hưởng
lương"), embedding (vector số mô tả nghĩa của văn bản, nghĩa gần thì số gần) đỡ được
một phần, nhưng với mã lỗi, tên hàm, số hiệu văn bản thì embedding lại yếu. Thứ hai là
**câu trả lời "nghe có vẻ đúng"**: mô hình ngôn ngữ được huấn luyện để viết trôi chảy,
nên khi thiếu bằng chứng nó vẫn viết trôi chảy. Lỗi này chỉ bắt được bằng đánh giá, không
bắt được bằng mắt.

![Pipeline RAG production: làn indexing offline, làn query online, và vòng lặp eval và observability nối hai làn](blog/rag-production-techniques-pipeline.svg)

Sơ đồ trên là khung của cả bài. Làn trên chạy offline mỗi khi dữ liệu đổi; làn giữa chạy
với mỗi request; làn dưới đo cả hai và đóng vòng lặp Measure → Diagnose → Optimize →
Re-evaluate. Giờ đi qua từng ô.

## 2. Kỹ thuật theo từng giai đoạn

Với mỗi kỹ thuật tôi giữ đúng một khuôn: vấn đề nó giải, cơ chế, và cái giá phải trả.
Phần "dùng khi nào, dừng khi nào" gom lại ở mục 3.

### 2.1 Dữ liệu và parsing

Chất lượng chunk bị chặn trên bởi chất lượng parse. Một file PDF hai cột đọc theo dòng
ngang sẽ trộn hai cột vào nhau; bảng tài chính đọc thành một dòng dài sẽ mất quan hệ
hàng-cột; header và footer lặp ở mọi trang sẽ thành "nội dung" trong mọi chunk.

**Layout-aware parsing** là dùng mô hình nhận diện bố cục trang (cột, tiêu đề, bảng,
chú thích, thứ tự đọc) trước khi trích chữ. [Docling](https://docling-project.github.io/docling/)
(mã nguồn mở, IBM) làm đúng việc này cho PDF, DOCX, PPTX: nhận diện layout, thứ tự đọc,
cấu trúc bảng, rồi xuất ra Markdown hoặc JSON. Unstructured và LlamaParse là hai lựa chọn
cùng nhóm. Bảng nên giữ dạng Markdown table hoặc JSON thay vì text phẳng, vì mô hình đọc
được quan hệ hàng-cột từ đó.

**Metadata extraction** là gắn cho mỗi đoạn các trường có cấu trúc: tiêu đề tài liệu, mục
cha, ngày hiệu lực, loại tài liệu, tenant (khách hàng nào), quyền truy cập. Metadata không
phục vụ embedding; nó phục vụ *lọc* ở bước retrieval và *trích dẫn* ở bước generation.
Thiếu metadata là lý do hệ thống không thể trả lời "theo phiên bản nào" và không thể chặn
người dùng A đọc tài liệu của B.

Giá phải trả: thời gian index tăng (mô hình layout chạy chậm hơn trích chữ thuần hàng
chục lần) và thêm một thành phần cần bảo trì. Nguồn đã là Markdown, HTML sạch hay dữ
liệu từ API thì không cần mô hình layout.

### 2.2 Chunking

Chunk (đoạn nhỏ được cắt từ tài liệu để embed và tìm) phải đủ nhỏ để embedding tập trung
vào một ý, và đủ lớn để mô hình đọc hiểu được. Hai yêu cầu này mâu thuẫn, và mọi kỹ
thuật chunking đều là một cách dung hòa.

**Fixed-size**: cắt mỗi N ký tự hoặc N token, có overlap (phần chồng lấn giữa hai chunk
kề nhau). Nhanh, dễ đoán, nhưng cắt mù: giữa câu, giữa bảng, giữa code block. Đây là
baseline để so sánh, không phải lựa chọn cuối.

**Recursive**: cắt theo thứ tự ưu tiên của dấu phân cách, thử đoạn văn trước (`\n\n`), đoạn
nào vẫn quá dài mới xuống dòng (`\n`), rồi khoảng trắng, rồi ký tự. Ý tưởng: đơn vị lớn
hơn (đoạn văn) thường gắn nghĩa với nhau hơn, nên cố giữ nguyên chúng khi còn có thể.
Đây là mặc định hợp lý cho văn bản chung. Với LangChain 1.x, bộ cắt nằm trong package
`langchain-text-splitters` (bản 1.1.x):

```python
# pip install langchain-text-splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,      # đo bằng ký tự (length_function mặc định là len)
    chunk_overlap=120,   # ~15%: ý bị cắt đôi vẫn còn nguyên ở một bên
    separators=["\n\n", "\n", " ", ""],  # thứ tự thử, đây cũng là mặc định
)
chunks = splitter.split_text(document_text)
```

**Semantic chunking**: embed từng câu, đi dọc tài liệu và cắt ở chỗ độ tương đồng giữa
câu liền kề tụt xuống (nghĩa đổi chủ đề). Chunk ra theo ý chứ không theo độ dài. Giá:
phải embed từng câu lúc index (tốn gấp nhiều lần), kích thước chunk không đoán trước
được, và với tài liệu kỹ thuật đã có tiêu đề rõ ràng thì nó hiếm khi thắng cách cắt theo
cấu trúc.

**Structure-aware (document-aware)**: cắt theo cấu trúc sẵn có của tài liệu: heading
Markdown, mục trong hợp đồng, hàm trong code, bảng giữ nguyên một khối. Ranh giới do tác
giả tài liệu đặt thường đúng hơn mọi thuật toán, và mỗi chunk mang luôn đường dẫn tiêu
đề ("Chương 3 > 3.2 Hoàn tiền") làm metadata. Nếu nguồn có cấu trúc, đây là lựa chọn
đầu tiên.

**Parent-child (small-to-big)**: embed và tìm bằng chunk *con* nhỏ (100–200 từ, nghĩa tập
trung, khớp câu hỏi tốt), nhưng đưa cho mô hình chunk *cha* lớn (một mục trọn vẹn) chứa
chunk con đó. Tách được hai yêu cầu mâu thuẫn: tìm bằng cái nhỏ, đọc bằng cái lớn.
Chatbot trên chính trang portfolio này dùng đúng cách đó: cha khoảng 300 từ, con 60 từ.
Giá: index to hơn, và cần khử trùng khi nhiều con cùng trỏ về một cha.

**Sentence-window**: biến thể cực đoan của parent-child. Mỗi chunk là *một câu*, nhưng
lưu kèm cửa sổ vài câu xung quanh trong metadata; khi tìm trúng câu thì thay nó bằng
cửa sổ trước khi đưa cho mô hình. Trong LlamaIndex đó là `SentenceWindowNodeParser`
(mặc định `window_size=3`, tức 3 câu mỗi bên) cộng với
`MetadataReplacementPostProcessor`. Hợp với tài liệu nhiều ý ngắn, dày đặc; không hợp
với tài liệu dài vì số node tăng vọt.

**Contextual chunk headers / Contextual Retrieval**: một chunk tách khỏi tài liệu mất
ngữ cảnh. "Doanh thu tăng 3%" không nói công ty nào, quý nào. Cách rẻ: ghép tiêu đề tài
liệu và đường dẫn mục vào đầu chunk trước khi embed. Cách đầy đủ hơn là
[Contextual Retrieval của Anthropic](https://www.anthropic.com/news/contextual-retrieval):
cho một LLM đọc *cả tài liệu* và viết 50–100 token mô tả vị trí của chunk trong tài liệu,
ghép đoạn đó vào đầu chunk, rồi mới embed và index BM25. Số liệu họ công bố: chỉ
contextual embedding giảm tỷ lệ tìm hụt (1 trừ recall@20) 35%; thêm contextual BM25 giảm
49%; thêm rerank giảm 67%. Chi phí một lần, nhờ prompt caching, khoảng 1,02 USD mỗi
triệu token tài liệu. Cũng bài đó khuyên: kho dữ liệu dưới ~200k token thì đừng làm RAG,
nhét cả vào prompt.

**Deduplication**: cùng một đoạn xuất hiện ở nhiều tài liệu (disclaimer, mẫu email, câu
mở đầu lặp), hoặc nhiều chunk con trỏ về một cha. Khử trùng theo hash nội dung lúc index
và theo cosine gần 1 lúc retrieval. Rẻ, không có lý do để bỏ qua.

### 2.3 Phía câu hỏi

Tài liệu đã index xong thì không đổi được trong lúc chạy; thứ còn đổi được là câu hỏi.
Mọi kỹ thuật ở đây đều biến câu hỏi của người dùng thành thứ mà bộ tìm kiếm tìm tốt hơn.

**Query rewriting**: cho một mô hình nhỏ viết lại câu hỏi thành dạng rõ ràng, đủ chủ
ngữ, bỏ phần chào hỏi, điền ngữ cảnh từ các lượt trước ("nó" → "chính sách hoàn tiền").
Giải quyết câu hỏi mơ hồ và hội thoại nhiều lượt. Giá: thêm một lần gọi LLM trên mọi
request.

**Multi-query**: sinh 3–5 cách diễn đạt khác nhau của cùng câu hỏi, tìm bằng tất cả,
gộp kết quả. Tăng recall (tỷ lệ tìm được những gì cần tìm) khi tài liệu dùng từ khác
người hỏi. Giá: số lần tìm nhân lên theo số câu, và phải có bước gộp (xem RRF ở 2.4).

**Step-back prompting**: với câu hỏi quá cụ thể, sinh thêm một câu hỏi "lùi một bước" ở
mức khái niệm ("nhiệt độ lý tưởng để ủ bia lager là bao nhiêu?" → "yếu tố nào quyết
định nhiệt độ ủ bia?"), tìm bằng cả hai. Nguồn là bài
[Take a Step Back](https://arxiv.org/abs/2310.06117) (Google DeepMind, ICLR 2024). Hợp
với câu hỏi mà tài liệu nói về nguyên lý còn người dùng hỏi về trường hợp.

**HyDE (Hypothetical Document Embeddings)**: đây là trò "bịa trước một câu trả lời rồi
đi tìm bằng nó". Cơ chế: cho LLM viết một đoạn văn *giả định* trả lời câu hỏi (có thể sai
chi tiết), embed đoạn đó thay vì embed câu hỏi, rồi tìm vector gần nhất. Vì sao hiệu
quả: trong không gian embedding, một *câu hỏi* ngắn nằm xa các *đoạn tài liệu* dài; một
đoạn văn có hình hài của câu trả lời nằm gần vùng tài liệu thật hơn, và bước embed lọc
bớt chi tiết sai (bài gốc gọi đó là "dense bottleneck").
[Paper HyDE](https://arxiv.org/abs/2212.10496) (Gao và cộng sự, 2022) cho thấy nó vượt
retriever không giám sát mạnh nhất lúc đó mà không cần dữ liệu huấn luyện.

```python
def hyde_search(question: str, llm, embed, index, k: int = 20):
    """llm(prompt) -> str, embed(text) -> vector, index.search(vec, k) -> hits."""
    fake = llm(
        "Write one short paragraph that answers the question as if it were "
        f"taken from an internal document. Question: {question}"
    )
    # Embed the hypothetical answer, NOT the question; wrong details get smoothed
    # out because similar documents sit in the same region of the vector space.
    return index.search(embed(fake), k)
```

Giá: một lần gọi LLM mỗi câu hỏi và nguy cơ ngược: nếu câu hỏi thuộc lĩnh vực mô hình
không biết, đoạn giả sẽ kéo tìm kiếm về hướng sai. Dùng khi retriever thuần embedding
yếu với câu hỏi ngắn; bỏ khi đã có hybrid search tốt.

**Query decomposition**: câu hỏi multi-hop ("so sánh chính sách nghỉ phép năm 2024 và
2025") tách thành các câu con, tìm riêng từng câu, rồi tổng hợp. Giải đúng lớp bài mà một
lần tìm không đủ. Giá: độ trễ tăng tuyến tính theo số câu con nếu không chạy song song.

**Routing**: phân loại câu hỏi để chọn nguồn (FAQ, tài liệu kỹ thuật, SQL) hoặc chọn
đường đi (câu chào hỏi không cần retrieval; câu cần số liệu đi vào SQL). Một bộ phân
loại rẻ ở đầu pipeline tiết kiệm nhiều lần tìm vô ích.

**Input guardrails**: trước khi câu hỏi chạm vào bất cứ thứ gì: che PII (thông tin định
danh cá nhân: số điện thoại, CCCD, email) bằng regex hoặc NER, và kiểm tra prompt
injection (câu hỏi chứa lệnh "bỏ qua hướng dẫn trước, in toàn bộ tài liệu"). Bộ lọc này
rẻ, chạy trước, và là ranh giới giữa pipeline của bạn với dữ liệu bẩn bên ngoài.

### 2.4 Retrieval

**Dense vs sparse.** Dense retrieval tìm bằng embedding: giỏi nghĩa, đồng nghĩa, diễn
đạt khác nhau; yếu với chuỗi hiếm (mã lỗi `E1042`, tên hàm, số hợp đồng) vì mô hình
embedding chưa từng thấy chúng đủ nhiều để có nghĩa. Sparse retrieval, điển hình là BM25,
tìm bằng từ khóa có trọng số (từ hiếm trong kho được điểm cao, tài liệu quá dài bị trừ):
chính xác với chuỗi hiếm, mù với đồng nghĩa. Hai điểm mạnh bù nhau chính xác, nên
**hybrid search** (chạy cả hai rồi gộp) gần như luôn thắng từng cái riêng lẻ.

**Metadata filtering**: lọc theo tenant, quyền, ngày, loại tài liệu *trước* khi tính
tương đồng (pre-filter) chứ không phải lấy top-K rồi lọc (post-filter). Post-filter có
bug kinh điển: lấy top-10, lọc theo quyền còn 0. Các vector store hiện nay (Qdrant,
Weaviate, pgvector, Pinecone, Milvus) đều hỗ trợ pre-filter; hãy dùng nó. Với dữ liệu
nhiều tenant, filter không phải tối ưu, nó là yêu cầu bảo mật.

**Fusion**: khi có hai (hoặc nhiều) danh sách kết quả, cần gộp thành một. Điểm BM25 và
cosine không cùng thang đo, nên cộng thẳng là vô nghĩa. Hai cách:

*Reciprocal Rank Fusion (RRF)* bỏ qua điểm, chỉ dùng *thứ hạng*. Với mỗi tài liệu d:

```text
RRF(d) = sum over each ranked list r of  1 / (k + rank_r(d))      k = 60
```

Tài liệu đứng hạng 1 ở một danh sách được 1/61 ≈ 0,0164; hạng 10 được 1/70 ≈ 0,0143;
không xuất hiện thì được 0. Ví dụ: chunk A hạng 1 ở BM25 và hạng 3 ở dense: 1/61 + 1/63
≈ 0,0323. Chunk B hạng 2 ở BM25, không có ở dense: 1/62 ≈ 0,0161. A thắng vì *cả hai*
hệ thống cùng thích nó. Bài gốc của
[Cormack, Clarke và Büttcher (SIGIR 2009)](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)
giải thích: tài liệu hạng cao quan trọng hơn, nhưng hạng thấp vẫn còn giá trị chứ không
mất hẳn như khi dùng hàm mũ, và hằng số k làm dịu ảnh hưởng của một hệ thống xếp hạng
"lệch"; k = 60 được chọn trong thử nghiệm sơ bộ, gần tối ưu nhưng không nhạy cảm.

```python
def rrf(ranked_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """ranked_lists: each inner list holds chunk ids, best first."""
    scores: dict[str, float] = {}
    for ranking in ranked_lists:
        for rank, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)

fused = rrf([bm25_ids, dense_ids])[:80]   # feed the top 80 to the reranker
```

*Weighted score fusion* giữ điểm nhưng chuẩn hóa từng danh sách về [0, 1] (min-max trên
danh sách đó) rồi cộng có trọng số: `alpha × dense + (1 − alpha) × sparse`. Weaviate gọi
đây là `relativeScoreFusion` và là mặc định từ v1.24; `alpha = 1` là thuần vector,
`alpha = 0` là thuần BM25 ([tài liệu hybrid của Weaviate](https://docs.weaviate.io/weaviate/search/hybrid)).
Ưu điểm so với RRF: giữ được khoảng cách giữa các điểm (hạng 1 bỏ xa hạng 2 thì vẫn thấy),
nhờ đó mới cắt được theo ngưỡng. Nhược: thêm một tham số alpha cần tune trên test set.

Mặc định của tôi: RRF trước, vì không có gì để tune; chuyển sang weighted khi cần ngưỡng
tự tin để quyết định "không trả lời".

![Luồng hybrid retrieval: BM25 và dense mỗi bên lấy top 50, gộp bằng RRF, cross-encoder rerank, giữ top 5 đưa vào LLM](blog/rag-production-techniques-hybrid-rerank.svg)

### 2.5 Reranking

Retrieval bước đầu buộc phải rẻ vì nó chạy trên toàn bộ kho. Reranking là bước đắt chạy
trên danh sách ngắn, để sửa thứ tự.

**Bi-encoder vs cross-encoder.** Bi-encoder (cách embedding thông thường) mã hóa câu hỏi
và tài liệu *riêng rẽ* thành hai vector rồi so khoảng cách; tài liệu được mã hóa trước
nên tìm được trong hàng triệu mục. Nhưng hai vector không "nhìn thấy nhau" lúc mã hóa.
Cross-encoder đưa *cặp* (câu hỏi, tài liệu) vào cùng một lượt chạy mô hình, attention
chạy chéo giữa từng từ của câu hỏi và từng từ của tài liệu, rồi xuất một điểm liên quan.
Chính xác hơn nhiều, nhưng mỗi cặp là một lần chạy mô hình, nên chỉ dùng được trên vài
chục ứng viên ([tài liệu Sentence Transformers](https://www.sbert.net/examples/applications/retrieve_rerank/README.html)).

Khuôn chuẩn là **retrieve wide, rerank narrow**: lấy 50–150 ứng viên bằng hybrid, rerank,
giữ top-K nhỏ (3–10) cho mô hình. Anthropic trong bài Contextual Retrieval dùng 150
ứng viên và giữ 20; với chatbot nội bộ tôi thường thấy 50 → 5 là đủ.

```python
# pip install sentence-transformers  (model from the Sentence Transformers docs)
from sentence_transformers import CrossEncoder
import torch

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L6-v2",
                        activation_fn=torch.nn.Sigmoid())  # scores in [0, 1]

pairs = [(question, chunk.text) for chunk in candidates]   # ~80 pairs
scores = reranker.predict(pairs)
top = sorted(zip(candidates, scores), key=lambda t: t[1], reverse=True)[:5]
```

Bảng model của Sentence Transformers ghi `ms-marco-MiniLM-L6-v2` đạt NDCG@10 74,30 trên
TREC DL 19 ở khoảng 1.800 tài liệu/giây; bản L2 nhanh hơn gấp đôi nhưng NDCG thấp hơn 3
điểm. Đó là cái "selective reranking" ở mục 2.8 đang nói tới. Nếu không muốn tự host,
[Cohere Rerank](https://docs.cohere.com/docs/rerank-overview) (hiện tại `rerank-v5.0-pro`
và `rerank-v5.0-fast`, đa ngôn ngữ) là một API với `top_n`.

**LLM reranker**: đưa câu hỏi cùng 10–20 ứng viên vào một LLM và yêu cầu xếp hạng hoặc
chấm điểm. Chính xác nhất khi tiêu chí liên quan phức tạp (cần suy luận), nhưng chậm và
đắt nhất; dùng ở bước cuối với danh sách rất ngắn, hoặc offline để tạo nhãn huấn luyện
cross-encoder.

### 2.6 Tối ưu context

Mục tiêu không phải retrieve nhiều hơn mà là *bằng chứng tốt hơn trên ít token hơn*.

**Trimming theo ngân sách token**: đặt trần cứng (ví dụ 3.000 token context), xếp chunk
theo điểm rerank, lấy đến khi đầy. Đơn giản, chặn được bill tăng theo độ dài. Chatbot
của portfolio này kẹp ở server (`MAX_CONTEXT_CHUNKS`, `MAX_CONTEXT_CHARS`) vì endpoint
công khai: không bao giờ tin client gửi bao nhiêu context.

**Compression**: với mỗi chunk đã chọn, chỉ giữ các câu liên quan đến câu hỏi. Cách rẻ:
chấm từng câu bằng embedding hoặc cross-encoder và bỏ câu dưới ngưỡng (extractive). Cách
đắt: cho LLM tóm tắt chunk theo câu hỏi (abstractive), có rủi ro tóm tắt bịa. Tôi dùng
extractive; abstractive chỉ khi context dài gấp nhiều lần ngân sách.

**Ordering (lost in the middle)**: bài
[Lost in the Middle](https://arxiv.org/abs/2307.03172) (Liu và cộng sự, TACL 2023) đo
được rằng mô hình dùng tốt nhất thông tin nằm ở *đầu* và *cuối* context, và tụt rõ khi
thông tin nằm giữa, kể cả mô hình long-context. Hệ quả thực hành: đừng xếp theo điểm giảm
dần rồi để chunk tốt thứ hai nằm giữa. Xếp chunk mạnh nhất lên đầu, mạnh thứ hai xuống
cuối, phần còn lại vào giữa. Chi phí bằng 0.

**Dedup và gộp cha**: nhiều chunk con cùng một cha thì đưa một lần cha đó. Hai chunk
giống nhau trên 95% thì giữ một.

### 2.7 Generation

Retrieval tốt vô nghĩa nếu mô hình vẫn bịa trên đó. Bài 2 đã nói về grounded prompt;
ở đây là những gì production cần thêm.

**Grounded prompting**: chỉ trả lời từ context; thiếu thì nói thiếu; mỗi ý nêu nguồn.
Đánh số chunk (`[1]`, `[2]`) và yêu cầu mô hình trích số đó. Chữ "chỉ" quan trọng: không
có nó, mô hình trộn kiến thức huấn luyện vào và bạn không phân biệt được.

**Citations**: trích dẫn không phải trang trí. Nó là cái móc để *kiểm tra* được câu trả
lời (người đọc click vào xem) và để *đo* được (câu nào không có nguồn là câu đáng ngờ).
Lưu `chunk_id` cùng câu trả lời trong trace.

**Answer verification**: sau khi sinh, chạy một lượt rẻ: tách câu trả lời thành các
khẳng định, hỏi một mô hình nhỏ "khẳng định này có được context hỗ trợ không". Khẳng định
không được hỗ trợ thì xóa hoặc gắn cờ. Đây chính là cơ chế của metric faithfulness ở
mục 4, chạy online thay vì offline. Giá: thêm một lần gọi mô hình và vài trăm ms.

**Confidence routing / "tôi không biết"**: nếu điểm rerank cao nhất dưới ngưỡng, hoặc
bộ kiểm tra trả về "không đủ bằng chứng", thì không sinh câu trả lời dài; trả lời "tôi
không tìm thấy trong tài liệu" kèm gợi ý, hoặc chuyển sang kênh khác (tìm web, chuyển
người). Bài [Corrective RAG](https://arxiv.org/abs/2401.15884) chính thức hóa ý này
bằng một bộ đánh giá retrieval nhẹ cho ra độ tin cậy, rồi chọn hành động theo đó. Một
câu "tôi không biết" đúng lúc đáng giá hơn mười câu trả lời trôi chảy sai.

### 2.8 Độ trễ và chi phí

Một hệ thống thông minh mất 8 giây chưa sẵn sàng cho production. Thứ tự tôi làm:

**Đo trước**: trace từng bước (mục 5). Thường 60–70% thời gian nằm ở generation, phần
còn lại ở rerank và gọi LLM phụ (rewrite, HyDE). Tối ưu chỗ chiếm nhiều nhất.

**Embedding cache và semantic cache**: embed câu hỏi là một lần gọi mạng; cache theo
chuỗi chính xác là miễn phí. Semantic cache đi xa hơn: nếu câu hỏi mới gần (cosine >
0,95) một câu hỏi đã trả lời, trả lại câu trả lời cũ. Hit rate 20–40% là bình thường với
FAQ nội bộ, và mỗi hit tiết kiệm trọn vẹn cả pipeline. Rủi ro: trả lời cũ cho câu hỏi
"gần giống nhưng khác" ("năm nay" vs "năm ngoái"); đặt ngưỡng cao và TTL ngắn.
Portfolio này dùng cache 24 giờ theo cặp (câu hỏi, context), hình thức đơn giản nhất.

**Parallel retrieval**: BM25, dense, các câu multi-query là độc lập; chạy đồng thời.
Trong Python là `asyncio.gather`. Độ trễ từ tổng thành max.

**Selective reranking**: chỉ rerank khi cần (điểm top-1 và top-5 của fusion gần nhau
tức là chưa phân thắng bại), hoặc dùng model nhẹ hơn (L2 thay L6) cho đường nóng và
model nặng cho câu hỏi khó.

**Mô hình nhỏ cho việc hẹp**: rewrite, phân loại routing, kiểm tra claim không cần mô
hình lớn nhất. Dùng mô hình nhỏ, nhiệt độ thấp. Khi lượng request đủ lớn, **distillation**
(huấn luyện mô hình nhỏ bắt chước đầu ra của mô hình lớn trên chính dữ liệu của bạn) đưa
chi phí mỗi lần gọi xuống một bậc.

**Cắt token nghiêm ngặt**: trần context (2.6), `max_tokens` cho câu trả lời, prompt
caching của nhà cung cấp cho phần system prompt lặp lại.

**Streaming**: không giảm tổng thời gian nhưng giảm thời gian đến token đầu tiên, thứ
người dùng cảm nhận.

## 3. Dùng khi nào, dừng khi nào

Mỗi kỹ thuật ở trên đều cộng thêm độ trễ, tiền, hoặc một thành phần nữa có thể hỏng.
Hệ thống tốt là hệ thống *đơn giản nhất còn đạt ngưỡng*. Nguyên tắc: thêm X chỉ khi
metric Y cho thấy Z, và đo lại sau khi thêm.

| Kỹ thuật | Chữa triệu chứng gì | Giá | Bỏ qua khi |
|---|---|---|---|
| Layout-aware parsing | bảng, cột, header lẫn vào chunk | index chậm 10–50x | nguồn là Markdown/HTML sạch |
| Structure-aware chunking | chunk cắt ngang mục, mất tiêu đề | gần 0 | tài liệu không có cấu trúc |
| Parent-child | tìm trúng nhưng context quá mỏng | index lớn hơn | chunk 300–500 từ đã đủ |
| Contextual retrieval | chunk mất ngữ cảnh tài liệu | 1 lần LLM mỗi chunk | kho nhỏ, chunk đã có header |
| Query rewriting | câu hỏi mơ hồ, hội thoại nhiều lượt | +1 LLM call, +300 ms | câu hỏi đơn, một lượt |
| Multi-query | recall thấp do khác từ ngữ | x3–5 lần tìm | hybrid đã kéo recall lên |
| HyDE | câu hỏi ngắn, embedding tìm lệch | +1 LLM call | đã có BM25 trong hybrid |
| Decomposition | câu hỏi multi-hop | độ trễ theo số câu con | test set không có multi-hop |
| Hybrid + RRF | mã, ID, tên riêng tìm hụt | thêm chỉ mục BM25 | kho toàn văn xuôi, recall đã cao |
| Metadata filter | sai tenant, sai phiên bản | gần 0 | một tenant, một phiên bản |
| Cross-encoder rerank | recall ổn, precision top-5 thấp | +100–500 ms | top-5 của hybrid đã đúng |
| LLM rerank | tiêu chí liên quan cần suy luận | +1–3 s | cross-encoder đã đủ |
| Compression | context đầy nhưng nhiều câu thừa | +1 bước | ngân sách token còn dư |
| Reorder (lost in middle) | chunk đúng ở giữa bị bỏ qua | 0 | luôn làm |
| Answer verification | claim không có nguồn | +1 LLM call | faithfulness đã > 0,9 |
| Semantic cache | câu hỏi lặp, p95 cao | thêm store, rủi ro trả lời cũ | câu hỏi hiếm khi lặp |
| Distillation | chi phí mỗi call quá cao ở lưu lượng lớn | dữ liệu + huấn luyện | lưu lượng nhỏ |

![Thang start-simple: baseline, hybrid và RRF, rerank, chunk tốt hơn, phía câu hỏi; mỗi bậc có metric kích hoạt và luật dừng](blog/rag-production-techniques-ladder.svg)

Thang leo cụ thể tôi dùng:

1. **Baseline**: recursive chunking 800 ký tự, dense top-5, grounded prompt, và một bộ test vàng 50 câu. Chưa có test set thì chưa được leo bậc nào.
2. **Hybrid + RRF + metadata filter** khi Recall@10 thấp và nhìn vào các câu hỏng thấy mã, ID, tên riêng tìm hụt.
3. **Cross-encoder rerank** khi recall@50 cao nhưng context precision ở top-5 thấp (đúng chunk có trong 50 nhưng không lọt top-5).
4. **Parent-child hoặc contextual retrieval** khi chunk đúng được tìm thấy nhưng câu trả lời thiếu ngữ cảnh (faithfulness cao, answer correctness thấp).
5. **Phía câu hỏi** (rewrite, multi-query, HyDE, decomposition) khi phần hỏng còn lại là câu hỏi mơ hồ hoặc multi-hop.

Dừng khi metric đã qua ngưỡng, p95 và chi phí trong ngân sách, hoặc bậc tiếp theo chữa
một triệu chứng bạn chưa thấy. Và đừng leo hai bậc cùng lúc: không tách được cái nào có
tác dụng.

## 4. Đánh giá RAG

Không đo được thì không tối ưu được, và "đọc vài câu trả lời thấy ổn" không phải đo.
Đánh giá RAG chia hai lớp: retrieval (tìm đúng chưa) và end-to-end (trả lời đúng và có
căn cứ chưa). Cả hai cần một bộ test.

### 4.1 Bộ test vàng (golden set)

Golden set là danh sách câu hỏi kèm *tham chiếu*: câu trả lời đúng (reference) và/hoặc
chunk đúng (reference contexts). Cách xây:

- Lấy 50–200 câu từ log thật (hoặc từ người dùng mục tiêu), vì câu tự nghĩ ra thường dễ hơn câu thật.
- Trộn loại: single-hop cụ thể, multi-hop, câu không có trong tài liệu (phải từ chối), câu mơ hồ. Mỗi loại đo một thứ khác.
- Ghi reference answer ngắn và id chunk chứa câu trả lời. Việc này là lao động tay chân, và là khoản đầu tư sinh lời nhất của cả dự án.
- Khi chưa có người gán nhãn, RAGAS có `TestsetGenerator`: nó dựng knowledge graph từ tài liệu, rồi sinh câu hỏi theo mặc định khoảng một nửa single-hop specific, một phần tư multi-hop abstract, một phần tư multi-hop specific ([tài liệu](https://docs.ragas.io/en/stable/getstarted/rag_testset_generation/)). Câu sinh tự động cần người duyệt lại; chúng tốt để khởi động, không thay được log thật.

### 4.2 Metric cho retrieval

Có reference contexts thì đo được retrieval mà không cần LLM nào:

- **Recall@K**: trong K chunk lấy về, có bao nhiêu phần trăm các chunk đúng. Câu hỏi có 2 chunk đúng, top-10 chứa 1 → Recall@10 = 0,5. Đây là metric số một: không tìm được thì mọi bước sau vô nghĩa.
- **MRR (Mean Reciprocal Rank)**: 1 chia cho hạng của chunk đúng *đầu tiên*, trung bình trên các câu. Chunk đúng ở hạng 3 → 1/3. Đo "bao nhanh người dùng gặp cái đúng".
- **NDCG@K**: như MRR nhưng tính mọi chunk đúng, giảm trọng số theo log của hạng, chuẩn hóa về [0, 1] so với thứ tự lý tưởng. Dùng khi có nhiều chunk đúng với mức liên quan khác nhau.

Đo Recall@50 và Recall@5 cùng lúc: Recall@50 cao mà Recall@5 thấp là tín hiệu cần
reranker; Recall@50 thấp là vấn đề ở chunking hoặc retriever, reranker không cứu được.

### 4.3 RAGAS

[RAGAS](https://docs.ragas.io/) là thư viện mã nguồn mở để đánh giá RAG bằng LLM. Bản
chất của phương pháp là **LLM-as-a-judge có cấu trúc**: thay vì hỏi mô hình "câu trả lời
này tốt không, chấm 1–10" (chủ quan, không ổn định), RAGAS *tách* câu trả lời (hoặc
tham chiếu) thành các **claim** (khẳng định nguyên tử), rồi hỏi mô hình từng câu hỏi
nhị phân nhỏ: claim này có được context hỗ trợ không? Metric là tỷ lệ. Câu hỏi nhỏ, nhị
phân thì mô hình trả lời ổn định hơn nhiều so với chấm điểm tổng thể.

Điểm thứ hai cần hiểu: **reference-free vs reference-based**. Metric reference-free chỉ
cần những gì hệ thống tự sinh ra (câu hỏi, context, câu trả lời), nên chạy được trên
traffic thật. Metric reference-based cần golden answer, nên chỉ chạy trên test set
nhưng đo được "đúng" thay vì chỉ "nhất quán".

![Sơ đồ bốn thành phần của một lượt RAG (câu hỏi, context, câu trả lời, tham chiếu) và metric RAGAS nào so sánh cặp nào](blog/rag-production-techniques-ragas-metrics.svg)

Bốn metric lõi, theo định nghĩa trong
[tài liệu RAGAS](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/) hiện tại:

**Faithfulness** (reference-free; context → answer). Câu trả lời có *nhất quán* với
context không. Cách tính: tách câu trả lời thành các claim; với mỗi claim hỏi mô hình
"có suy ra được từ context không"; điểm = số claim được hỗ trợ / tổng số claim. Ví dụ
trong tài liệu: context nói Einstein sinh 14/3/1879; câu trả lời "sinh ở Đức ngày
20/3/1879" có hai claim, một đúng một sai → 0,5. Đây là metric bắt hallucination. Lưu ý
nó không đo *đúng*: context sai mà câu trả lời chép theo thì faithfulness vẫn 1,0.

**Response relevancy** (reference-free; question ↔ answer; tên cũ answer relevancy).
Câu trả lời có *trả lời đúng câu hỏi* không, phạt câu trả lời thiếu hoặc lan man. Cách
tính thông minh: cho mô hình *sinh ngược* N câu hỏi (mặc định 3) từ câu trả lời, embed
chúng, tính cosine với câu hỏi gốc, lấy trung bình. Ý tưởng: nếu câu trả lời thực sự
trả lời câu hỏi, thì từ nó phải tái dựng lại được câu hỏi. Không đo tính đúng.

**Context precision** (reference-based; context ↔ reference). Chunk liên quan có được
xếp *lên trên* không. Mỗi chunk trong top-K được mô hình gắn nhãn liên quan hay không
(so với reference answer; biến thể không reference thì so với response); điểm là trung
bình precision@k tại các vị trí có chunk liên quan, tức average precision quen thuộc trong
IR. Thứ tự [đúng, sai] được 1,0; [sai, đúng] được 0,5. Metric này đánh giá reranker và
thứ tự.

**Context recall** (reference-based; context ↔ reference). Retriever có *lấy đủ* không.
Tách reference answer thành claim; với mỗi claim hỏi mô hình "context lấy về có chứa
nó không"; điểm = số claim được hỗ trợ / tổng. Dùng reference answer thay cho reference
contexts vì gán nhãn chunk tốn công hơn nhiều. Biến thể `NonLLMContextRecall` so
retrieved contexts với reference contexts bằng độ giống chuỗi, không cần LLM.

Hai metric nữa đáng biết, cũng trong tài liệu hiện tại:

**Factual correctness** (reference-based; answer ↔ reference). Tách cả câu trả lời và
reference thành claim, đếm TP (claim có ở cả hai), FP (chỉ ở câu trả lời), FN (chỉ ở
reference), rồi tính precision, recall, F1 (`mode` chọn). Đây là metric "đúng" thực
sự, bổ sung cho faithfulness chỉ đo "nhất quán".

**Noise sensitivity** (cần cả bốn đầu vào; thấp hơn là tốt). Tỷ lệ claim *sai* trong câu
trả lời khi hệ thống có context liên quan (`mode="relevant"`) hoặc context nhiễu
(`mode="irrelevant"`). Đo xem mô hình có bị context rác kéo đi không.

RAGAS hiện ở bản 0.4.x và đang chuyển sang API mới `ragas.metrics.collections` (API cũ
qua `SingleTurnSample` được đánh dấu deprecated từ 0.4, dự kiến bỏ ở 1.0). Chấm một mẫu
với API mới, theo đúng ví dụ trong tài liệu:

```python
# pip install ragas openai        (ragas 0.4.x, collections API)
from openai import AsyncOpenAI
from ragas.llms import llm_factory
from ragas.embeddings.base import embedding_factory
from ragas.metrics.collections import (
    Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall,
)

client = AsyncOpenAI()
judge = llm_factory("gpt-4o-mini", client=client)       # the judge model
emb = embedding_factory("openai", model="text-embedding-3-small", client=client)

faith = Faithfulness(llm=judge)                       # reference-free
relev = AnswerRelevancy(llm=judge, embeddings=emb)    # reference-free
prec = ContextPrecision(llm=judge)                    # needs reference
rec = ContextRecall(llm=judge)                        # needs reference

async def score_one(row: dict) -> dict:
    """row: user_input, response, retrieved_contexts (list[str]), reference."""
    q, a, ctx, ref = (row["user_input"], row["response"],
                      row["retrieved_contexts"], row["reference"])
    f = await faith.ascore(user_input=q, response=a, retrieved_contexts=ctx)
    r = await relev.ascore(user_input=q, response=a)
    p = await prec.ascore(user_input=q, reference=ref, retrieved_contexts=ctx)
    c = await rec.ascore(user_input=q, reference=ref, retrieved_contexts=ctx)
    return {"faithfulness": f.value, "relevancy": r.value,
            "ctx_precision": p.value, "ctx_recall": c.value}
```

Ba điều cần cẩn thận với mọi metric dùng LLM: (1) judge có nhiễu, chạy hai lần ra hai
số hơi khác, nên so sánh trên 50+ mẫu và nhìn xu hướng, không nhìn một số; (2) judge
tốn tiền, một mẫu bốn metric là hàng chục lần gọi, nên chạy trên test set chứ không
trên mọi request; (3) phải *hiệu chuẩn* một lần: lấy 30 mẫu, người chấm tay, xem metric
có đồng ý với người không, nếu không thì đổi judge hoặc đổi prompt của metric.

### 4.4 Công cụ khác

[DeepEval](https://deepeval.com/docs/metrics-introduction) tiếp cận theo kiểu unit test:
mỗi metric có `threshold`, `deepeval test run` tích hợp pytest nên chạy được trong CI;
bộ metric RAG tương đương (Faithfulness, Answer Relevancy, Contextual Precision/Recall/
Relevancy) và G-Eval cho tiêu chí tự định nghĩa bằng ngôn ngữ thường. LangSmith và Arize
Phoenix (mục 5) đều có evaluator chạy trên dataset và trên trace thật. Chọn một, dùng
đều; công cụ không quan trọng bằng việc có test set.

## 5. LLMOps cho RAG

LLMOps là phần vận hành: làm sao biết hệ thống đang làm gì, đổi nó mà không làm hỏng,
và giữ nó đúng khi dữ liệu và mô hình đổi.

### 5.1 Tracing và observability

Trace là bản ghi có cấu trúc của một request: câu hỏi vào, câu hỏi sau rewrite, chunk
nào được lấy với điểm bao nhiêu, prompt cuối cùng, câu trả lời, và thời gian, token, chi
phí của từng bước lồng nhau. Không có trace, mọi câu "sao nó trả lời thế này" đều là
đoán. Ba công cụ phổ biến: [Langfuse](https://langfuse.com/docs/observability/overview)
(mã nguồn mở, self-host được, có đánh giá, dataset, quản lý prompt),
[LangSmith](https://docs.langchain.com/langsmith) (của LangChain nhưng trace được code
không dùng LangChain), [Arize Phoenix](https://arize.com/docs/phoenix) (mã nguồn mở, dựa
trên OpenTelemetry/OpenInference). Với Langfuse Python SDK v5:

```python
# pip install langfuse   (SDK v5; reads LANGFUSE_PUBLIC_KEY / SECRET_KEY / BASE_URL)
from langfuse import get_client

langfuse = get_client()

def answer(question: str) -> str:
    with langfuse.start_as_current_observation(as_type="span", name="rag") as root:
        with langfuse.start_as_current_observation(as_type="span", name="retrieve") as s:
            chunks = retrieve(question)                      # hybrid + rerank
            s.update(output=[c.id for c in chunks])          # keep ids, not full text
        with langfuse.start_as_current_observation(
            as_type="generation", name="llm", model="gpt-4o-mini"
        ) as g:
            text = generate(question, chunks)
            g.update(output=text)
        root.update(output=text)
    langfuse.flush()        # short-lived processes must flush before exit
    return text
```

Mỗi trace nên ghi thêm: phiên bản prompt, phiên bản index, tên model embedding, cache
hit hay không, và có fallback hay không. Đây là các trục để lát nữa cắt dashboard.

### 5.2 Versioning: prompt, index, embedding model

Ba thứ này thay đổi hành vi hệ thống mà không đổi một dòng code, nên phải có phiên bản
như code:

- **Prompt** lưu trong repo hoặc prompt registry (Langfuse/LangSmith có), mỗi trace ghi version. Đổi prompt là một deploy.
- **Index** có tên theo phiên bản (`docs_v12_2026-10-20`) và một alias trỏ vào bản đang dùng; build bản mới xong, chạy eval, rồi mới chuyển alias. Rollback là đổi alias lại.
- **Embedding model**: đổi model là phải embed lại *toàn bộ* kho, vì vector của hai model không so sánh được với nhau. Không bao giờ trộn hai model trong một index. Ghi tên model vào metadata của index để không ai vô tình làm thế.

### 5.3 Offline eval trong CI như cổng chặn hồi quy

Pull request đổi chunking, prompt, model hay tham số retrieval phải chạy golden set và
so với baseline. Quy tắc tôi hay đặt: Recall@10 không giảm quá 2 điểm, faithfulness
không dưới 0,85, tỷ lệ từ chối đúng với câu "không có trong tài liệu" không giảm; vi
phạm thì CI đỏ. Chạy bằng pytest với DeepEval, hoặc một script RAGAS ghi kết quả vào
file và so sánh. Bộ test không cần lớn (50–200 câu), nhưng phải chạy *mọi lần*.

### 5.4 Online monitoring

Dashboard tối thiểu, cắt theo phiên bản prompt/index:

- Độ trễ p50/p95 tổng và theo bước (retrieve, rerank, generate).
- Token vào/ra và chi phí mỗi câu hỏi; tổng chi phí theo ngày với cảnh báo.
- Cache hit rate; tỷ lệ fallback (trả lời không có LLM, hoặc "không biết"); tỷ lệ lỗi.
- Phản hồi người dùng (thumbs up/down) gắn với trace, để kéo câu hỏng về golden set.
- Metric reference-free (faithfulness, response relevancy) chạy trên một *mẫu* traffic (1–5%) để thấy drift mà không trả tiền judge cho mọi request.

### 5.5 Re-indexing và độ tươi

Dữ liệu đổi mà index không đổi thì hệ thống trả lời theo quá khứ. Index tăng dần theo
hash nội dung (chỉ embed lại tài liệu đổi), chạy theo lịch hoặc theo sự kiện (webhook
từ wiki, commit vào repo). Mỗi chunk mang `source_version` và `indexed_at` để câu trả lời
nói được "theo bản ngày X". Trang portfolio này re-index khi deploy vì nội dung nằm
trong git; một wiki nội bộ cần job theo giờ.

### 5.6 A/B test, guardrails, serving

**A/B test**: khi offline eval nói "bản mới tốt hơn 3 điểm", vẫn nên để 10% traffic
chạy bản mới và so phản hồi người dùng, p95, chi phí trong một tuần. Offline eval đo trên
câu hỏi hôm qua; A/B đo trên câu hỏi hôm nay.

**Guardrails** hai đầu: đầu vào (PII, injection, chủ đề ngoài phạm vi), đầu ra (claim
không nguồn, lộ dữ liệu không được phép, định dạng). Guardrail là code chạy *trước* và
*sau* LLM, không phải lời dặn trong prompt.

**Deployment và serving**: pipeline đóng gói bằng Docker; Kubernetes khi cần scale theo
tải và tách worker index khỏi API; mô hình tự host chạy sau [vLLM](https://docs.vllm.ai/)
(PagedAttention và continuous batching cho throughput, API tương thích OpenAI nên code
không đổi khi chuyển giữa tự host và dịch vụ); dịch vụ quản lý (Bedrock, Vertex, Azure)
khi không muốn vận hành GPU. Backend của portfolio này là một hàm serverless cạnh Blob
store, đủ cho tải của nó; nguyên tắc vẫn vậy: chọn mức vận hành *nhỏ nhất* đáp ứng được.

### 5.7 Vòng lặp

Tất cả quay về một vòng: **Measure → Diagnose → Optimize → Re-evaluate**. Đo bằng trace
và golden set; chẩn đoán xem thừa số nào trong Retrieval × Context × Generation đang
kéo tích xuống; tối ưu *một* thứ; đo lại trên *cùng* test set. Một thay đổi không được
đo lại là một phỏng đoán.

> RAG quality = Retrieval × Context × Generation. Production = Quality + Latency + Cost + Reliability. Vế đầu nói bạn phải sửa thừa số yếu nhất; vế sau nói chất lượng chỉ là một trong bốn thứ người dùng thật cảm nhận.

## 6. Kết

Nếu chỉ giữ lại ba điều từ bài này: (1) có golden set trước khi thêm bất cứ kỹ thuật
nào, (2) leo thang theo metric chứ không theo bài báo mới, (3) trace mọi request để
chẩn đoán được thay vì đoán. Bài tiếp theo của series rời khỏi pipeline tuyến tính:
LangGraph và câu hỏi vì sao một chuỗi RAG cố định không đủ khi luồng xử lý cần rẽ nhánh,
lặp lại và nhớ trạng thái.
