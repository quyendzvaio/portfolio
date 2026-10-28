---
title: "RAG từ gốc: vì sao LLM cần tra cứu, và một pipeline RAG chạy như thế nào"
date: "2026-10-23"
tags: ["rag", "llm", "fundamentals"]
summary: "Điểm yếu cố hữu của LLM, tư tưởng cốt lõi của RAG, các khối thành phần và một ví dụ đi hết pipeline từ indexing đến câu trả lời có trích dẫn."
---

# RAG từ gốc: vì sao LLM cần tra cứu, và một pipeline RAG chạy như thế nào

Đây là bài đầu trong loạt sáu bài, đi từ "vì sao LLM cần RAG" đến "harness engineering cho
agent". Bài này không có framework, không có vector database cụ thể. Mục tiêu là sau khi đọc
xong, bạn nhìn vào bất kỳ hệ thống RAG nào cũng chỉ ra được từng khối đang làm gì và vì sao nó
phải có mặt ở đó. Các bài sau mới xây bằng LangChain, tối ưu, đánh giá, rồi lên agent.

## 1. LLM mạnh ở đâu, và yếu cố hữu ở đâu

Trước khi nói về điểm yếu, cần hiểu LLM (large language model, mô hình ngôn ngữ lớn, tức là
"bộ não" đứng sau ChatGPT, Claude hay Gemini) được tạo ra và sinh chữ như thế nào, vì mọi điểm
yếu bên dưới đều bắt nguồn từ đó.

### LLM được huấn luyện và sinh chữ như thế nào

Nói nôm na thế này. Hình dung một người đọc gần như toàn bộ chữ viết trên Internet, nhưng chỉ
đọc đến một ngày nhất định rồi dừng. Sau đó mọi cuốn sách bị cất đi. Thứ còn lại trong đầu người
đó không phải là các trang sách, mà là một "cảm giác" rất tốt về việc chữ nào hay đi sau chữ
nào, kèm theo rất nhiều sự kiện nhớ mang máng. Khi bạn hỏi, người đó không được mở sách; họ chỉ
nói ra câu nghe xuôi tai nhất dựa trên trí nhớ. Đó chính là một LLM.

Giờ nói lại bằng từ kỹ thuật, mỗi từ giải thích một lần. Mô hình là một cỗ máy tính toán chứa
hàng tỷ con số, gọi là tham số (parameter) hay trọng số (weight); huấn luyện là quá trình chỉnh
đi chỉnh lại các con số đó. Văn bản được cắt thành các mẩu nhỏ gọi là token, thường là một từ
hoặc một mảnh từ. Bài tập huấn luyện chỉ có một: nhìn các mẩu chữ đứng trước, đoán mẩu tiếp
theo. Làm bài tập đó hàng nghìn tỷ lần trên khối văn bản thu thập **đến một thời điểm nhất
định**, các con số dần "nén" lại cả quy luật ngôn ngữ lẫn vô số sự kiện.

Khi bạn hỏi, mô hình không tra cứu gì cả. Nó nhận prompt (prompt là toàn bộ văn bản bạn đưa
vào, gồm câu hỏi và mọi thứ kèm theo), đoán mẩu chữ kế tiếp, nối vào, rồi lặp lại cho đến khi
hết câu. Câu trả lời được dệt từ đúng hai nguồn: những gì các con số "nhớ", và những gì có trong
prompt. Hãy nhớ kỹ câu này, vì RAG xoay quanh nguồn thứ hai.

Từ cơ chế đó, sáu điểm yếu sau đây là hệ quả tất yếu, không phải lỗi của một nhà cung cấp nào.

### Điểm yếu 1: kiến thức dừng ở ngày cắt dữ liệu

Dữ liệu huấn luyện được chốt tại một thời điểm, gọi là knowledge cutoff. Mọi thứ xảy ra sau đó,
mô hình không biết: phiên bản thư viện mới, chính sách mới, giá mới. Tệ hơn, mô hình không có
cảm giác "mình không biết", nên nó vẫn trả lời bằng phiên bản cũ trong trí nhớ với giọng rất
chắc chắn.

### Điểm yếu 2: không biết dữ liệu riêng của bạn

Sổ tay nhân viên của công ty bạn, hợp đồng, ticket hỗ trợ, tài liệu nội bộ, cơ sở dữ liệu khách
hàng: không có gì trong số đó nằm trong tập huấn luyện. Phần lớn use case thực tế lại cần đúng
loại dữ liệu này. Một mô hình biết cả Wikipedia nhưng không biết quy định nghỉ phép của công ty
bạn thì không trả lời được câu hỏi đơn giản nhất của nhân viên mới.

### Điểm yếu 3: hallucination

Hallucination (ảo giác) là khi mô hình bịa ra thông tin nghe rất hợp lý: một con số, một điều
luật, một hàm API không tồn tại. Nguyên nhân nằm ngay trong cơ chế sinh chữ: mô hình được tối
ưu để tạo ra chuỗi token *có khả năng xuất hiện*, không phải chuỗi token *đúng sự thật*. Khi
tham số không chứa câu trả lời, mô hình vẫn phải sinh một token kế tiếp, và token "hợp lý nhất"
thường là một câu trả lời trôi chảy nhưng sai.

### Điểm yếu 4: không có nguồn để kiểm chứng

Kiến thức trong tham số là kiến thức đã bị nén và trộn lẫn. Mô hình không thể chỉ ra "tôi lấy
điều này từ trang 12 của tài liệu X", vì không có trang 12 nào trong tham số cả. Với người dùng,
một câu trả lời không có nguồn thì không kiểm chứng được, và trong các lĩnh vực như pháp lý, y
tế, tài chính, điều đó đồng nghĩa với không dùng được.

### Điểm yếu 5: context window có hạn

Context window là toàn bộ văn bản mô hình có thể "nhìn thấy" trong một lần gọi, gồm prompt và cả
câu trả lời nó đang sinh ra. Tài liệu của Anthropic mô tả nó như "bộ nhớ làm việc" của mô hình,
khác với kho dữ liệu huấn luyện ([Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)).
Giới hạn này ngày càng lớn, đã lên tới hàng trăm nghìn hoặc một triệu token, nhưng vẫn là giới
hạn: một kho tài liệu nội bộ vài chục nghìn trang không bao giờ nhét vừa. Và ngay cả khi vừa,
nghiên cứu "Lost in the Middle" của Liu và cộng sự cho thấy độ chính xác giảm rõ rệt khi thông
tin cần thiết nằm ở giữa một context dài, kể cả với các mô hình được thiết kế cho context dài
([Liu et al., 2023](https://arxiv.org/abs/2307.03172)). Nhiều hơn không đồng nghĩa với tốt hơn;
mỗi token thừa còn là tiền và độ trễ.

### Điểm yếu 6: dạy thêm kiến thức cho mô hình rất đắt

Muốn mô hình "biết" thêm, bạn có hai cách: huấn luyện lại hoặc fine-tuning (tinh chỉnh: tiếp tục
huấn luyện mô hình trên dữ liệu của bạn để điều chỉnh tham số). Cả hai đều tốn GPU, tốn người
chuẩn bị dữ liệu, và phải làm lại mỗi khi tài liệu thay đổi. Quan trọng hơn, fine-tuning không
giỏi việc nạp sự kiện mới. Nghiên cứu của Ovadia và cộng sự so sánh trực tiếp hai hướng và kết
luận rằng LLM "gặp khó khăn khi học sự kiện mới qua fine-tuning không giám sát", trong khi
retrieval cho kết quả tốt hơn một cách nhất quán, cả với kiến thức đã có lẫn kiến thức hoàn
toàn mới ([Ovadia et al., 2023](https://arxiv.org/abs/2312.05934)).

> Sáu điểm yếu trên có chung một gốc: kiến thức nằm trong tham số thì tĩnh, mờ, không truy vết
> được và đắt để thay đổi. Nguồn thông tin thứ hai, prompt, thì ngược lại: động, rõ ràng, có thể
> chỉ đích danh, và thay đổi chỉ bằng cách sửa văn bản.

## 2. RAG ra đời để giải quyết những vấn đề đó

RAG (Retrieval-Augmented Generation, sinh văn bản có bổ trợ truy xuất) được Lewis và cộng sự tại
Facebook AI đề xuất năm 2020. Bài báo gốc nêu đúng những vấn đề ở trên: mô hình lưu kiến thức
trong tham số nhưng khó truy cập và thao tác chính xác, khó chỉ ra nguồn gốc câu trả lời, và
khó cập nhật kiến thức. Giải pháp của họ là ghép hai loại bộ nhớ: **parametric memory** (tham số
của mô hình) và **non-parametric memory** (một chỉ mục vector của Wikipedia, được truy vấn bằng
một retriever học sẵn). Kết quả sinh ra "cụ thể hơn, đa dạng hơn và đúng sự thật hơn" so với mô
hình chỉ dùng tham số ([Lewis et al., 2020](https://arxiv.org/abs/2005.11401)).

Năm năm sau, "RAG" trong thực tế không còn là kiến trúc huấn luyện chung trong bài báo đó nữa,
mà là một mẫu thiết kế hệ thống: giữ nguyên LLM, dựng một hệ thống tìm kiếm bên cạnh, và nối hai
thứ lại qua prompt. Khảo sát của Gao và cộng sự chia lịch sử này thành ba giai đoạn, Naive RAG,
Advanced RAG và Modular RAG, và chỉ ra ba nền tảng của mọi hệ thống RAG: retrieval, generation
và augmentation ([Gao et al., 2023](https://arxiv.org/abs/2312.10997)). Bài này đi theo đúng ba
nền tảng đó.

Đối chiếu lại sáu điểm yếu:

| Điểm yếu của LLM | RAG xử lý thế nào |
|---|---|
| Kiến thức cũ | Tài liệu mới chỉ cần được index lại |
| Không biết dữ liệu riêng | Dữ liệu riêng là chính kho được truy xuất |
| Hallucination | Mô hình được yêu cầu trả lời từ đoạn văn đưa vào |
| Không có nguồn | Mỗi đoạn truy xuất có id, tiêu đề, trang |
| Context window có hạn | Chỉ đưa vài đoạn liên quan nhất, không đưa cả kho |
| Dạy thêm đắt | Không chạm vào tham số; sửa tài liệu là xong |

RAG không chữa hallucination tận gốc, vì mô hình vẫn có thể bỏ qua context hoặc hiểu sai nó.
Nhưng nó biến vấn đề từ "mô hình nhớ gì" thành "ta đưa gì vào prompt", và vế sau thì kiểm soát
và đo được.

## 3. Bản chất của RAG: thi mở sách thay vì thi đóng sách

Hình dung thế này. Bạn đi thi. Thi đóng sách, bạn chỉ có những gì đã học thuộc; gặp câu hỏi về
thứ chưa từng học, bạn hoặc bỏ trống, hoặc viết đại một câu nghe có vẻ đúng. Thi mở sách, bạn
vẫn là bạn, nhưng được mang tài liệu vào, lật đúng trang, rồi mới viết. Câu trả lời đúng hơn
hẳn, và bạn còn ghi được "theo trang 12".

Để ý một điều: thi mở sách không làm bạn thông minh hơn. Nó chỉ làm bạn **có thông tin hơn**
đúng lúc cần. RAG làm y hệt vậy với mô hình. Nói nôm na, RAG là: trước khi để mô hình trả lời,
hãy đi tìm vài đoạn tài liệu nói về đúng chuyện đang hỏi, đặt chúng ngay trước mặt mô hình cùng
với câu hỏi, và bảo nó "trả lời dựa trên mấy đoạn này". Mô hình không cần nhớ gì về công ty
bạn; nó chỉ cần được đọc đúng trang.

Vậy nên cái tên Retrieval-Augmented Generation, nghe dài dòng, thực ra chỉ là ba động tác: đi tìm
(retrieval), bổ sung vào câu hỏi (augmented), rồi mới viết câu trả lời (generation). Mọi thứ còn
lại trong bài này, chunk, embedding, vector store, reranker, chỉ là cách làm cho động tác "đi
tìm" nhanh và trúng.

![LLM một mình giống thi đóng sách: chỉ có trí nhớ, trả lời trôi chảy nhưng có thể cũ hoặc bịa; LLM cộng retrieval giống thi mở sách: câu hỏi đi qua retriever lấy đoạn văn từ tài liệu, ghép vào prompt rồi mới sinh câu trả lời có trích dẫn](blog/rag-fundamentals-open-book.svg)

### Trước và sau, trên cùng một câu hỏi

Giả sử công ty bạn có sổ tay nhân viên, và nhân viên mới hỏi chatbot nội bộ.

Prompt **không có** RAG:

```text
Nhân viên đang thử việc ở công ty mình được làm việc từ xa mấy ngày một tuần?
```

Mô hình không biết công ty "mình" là công ty nào. Nó sẽ trả lời kiểu "Thông thường các công ty
cho phép 1-2 ngày..." hoặc tệ hơn, khẳng định một con số. Không sai về ngữ pháp, nhưng vô giá
trị, và có thể gây hiểu nhầm.

Prompt **có** RAG, sau khi retriever tìm được hai đoạn liên quan:

```text
Bạn là trợ lý nội bộ. Chỉ trả lời dựa trên các đoạn CONTEXT bên dưới.
Nếu context không đủ để trả lời, hãy nói rõ là không tìm thấy.
Với mỗi ý, ghi nguồn theo dạng [tên tài liệu, mục].

CONTEXT
[1] Quy định làm việc từ xa v3 (cập nhật 03/2026), mục 2.1:
Nhân viên đã qua thử việc được làm việc từ xa tối đa 3 ngày/tuần.
Trong 2 tháng thử việc, nhân viên chỉ được làm từ xa 1 ngày/tuần và
phải được quản lý trực tiếp duyệt trước.

[2] Quy định làm việc từ xa v3 (cập nhật 03/2026), mục 2.3:
Ngày làm từ xa phải được đăng ký trên hệ thống HR trước 17:00 ngày hôm trước.

CÂU HỎI
Nhân viên đang thử việc được làm việc từ xa mấy ngày một tuần?
```

Câu trả lời giờ có thể là: "Trong thời gian thử việc (2 tháng), bạn được làm từ xa tối đa 1
ngày/tuần và cần quản lý trực tiếp duyệt trước [Quy định làm việc từ xa v3, mục 2.1]. Nhớ đăng
ký trên hệ thống HR trước 17:00 hôm trước [mục 2.3]." Đúng, có nguồn, và nếu tháng sau chính
sách đổi thành 2 ngày, bạn chỉ cần index lại file mới.

Hãy để ý ba thứ trong prompt thứ hai, vì đó là ba đòn bẩy bạn sẽ chỉnh suốt đời làm RAG: câu lệnh
"chỉ trả lời từ context", các đoạn context có nhãn nguồn, và yêu cầu trích dẫn. Phần còn lại
của hệ thống RAG tồn tại chỉ để điền đúng nội dung vào khung đó.

## 4. Các khối thành phần của RAG

Một hệ thống RAG có hai nửa chạy ở hai thời điểm khác nhau. **Phía indexing** chạy offline, mỗi
khi có tài liệu mới hoặc sửa đổi, để chuẩn bị "cuốn sách" sao cho tra được nhanh. **Phía query**
chạy online, mỗi lần có câu hỏi, để lật đúng trang và viết câu trả lời.

![Pipeline RAG gồm hai hàng: hàng indexing offline đi từ nguồn tài liệu qua load, parse và chunk, embed rồi vào vector store; hàng query online đi từ câu hỏi qua query processing, retrieve lấy top-k từ vector store, rerank, build prompt, rồi LLM sinh câu trả lời có trích dẫn](blog/rag-fundamentals-pipeline.svg)

### Phía indexing (offline)

**Load (nạp dữ liệu).** Đọc tài liệu từ nguồn: file PDF, trang wiki, bảng trong database, API,
Notion. Đầu ra là văn bản thô cộng metadata (siêu dữ liệu: thông tin mô tả tài liệu như tên
file, ngày cập nhật, phiên bản, phòng ban, quyền truy cập). Metadata hay bị xem nhẹ ở bước này,
nhưng chính nó cho phép lọc "chỉ lấy phiên bản mới nhất" và cho phép trích dẫn sau này.

**Parse và chunk.** Parse là biến định dạng gốc thành văn bản sạch, giữ được cấu trúc: tiêu đề,
bảng, danh sách. PDF là nơi nhiều hệ thống RAG chết âm thầm vì parse hỏng bảng hoặc gộp hai cột
thành một. Chunk là cắt văn bản thành các đoạn nhỏ (chunk), thường vài trăm token. Phải cắt vì
hai lý do: embedding của một đoạn quá dài sẽ "mờ" (một vector không thể đại diện tốt cho mười
chủ đề), và vì lúc trả lời ta chỉ muốn dán đúng đoạn liên quan, không phải cả tài liệu. Cách
cắt đơn giản nhất là theo kích thước cố định có chồng lấn (overlap) để câu bị cắt đôi vẫn nguyên
vẹn trong ít nhất một chunk. Các cách cắt thông minh hơn sẽ nói ở
[bài 3](#/blog/rag-production-techniques).

**Embed.** Embedding là một danh sách số (vector) mô tả ý nghĩa của một đoạn văn, sao cho hai
đoạn có nghĩa gần nhau thì có vector gần nhau. Tài liệu của OpenAI định nghĩa ngắn gọn: khoảng
cách giữa hai vector đo độ liên quan của chúng; vector gần nhau thì văn bản liên quan nhiều
([OpenAI, Embeddings](https://developers.openai.com/api/docs/guides/embeddings)). Một embedding
model (mô hình riêng, nhỏ hơn LLM nhiều) nhận một chunk và trả về vector, ví dụ 1.536 số với
`text-embedding-3-small`. Độ gần thường đo bằng cosine similarity, tức góc giữa hai vector: 1 là
cùng hướng, 0 là không liên quan.

```python
# Cosine similarity bằng Python thuần, để thấy "độ giống" chỉ là một phép tính.
# Các embedding thật có hàng nghìn chiều, nhưng công thức y hệt.
import math

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))          # tích vô hướng
    norm_a = math.sqrt(sum(x * x for x in a))        # độ dài vector a
    norm_b = math.sqrt(sum(y * y for y in b))        # độ dài vector b
    return dot / (norm_a * norm_b)

q  = [0.9, 0.1, 0.4]   # vector của câu hỏi (minh hoạ)
c1 = [0.8, 0.2, 0.5]   # chunk nói về cùng chủ đề
c2 = [0.1, 0.9, 0.0]   # chunk nói về chủ đề khác
print(round(cosine(q, c1), 2), round(cosine(q, c2), 2))  # 0.98 0.2
```

**Vector store.** Nơi lưu từng chunk kèm vector và metadata, và quan trọng nhất, nơi trả lời
nhanh câu hỏi "cho tôi k vector gần vector này nhất" trên hàng triệu vector. Với vài nghìn chunk,
một mảng NumPy và phép nhân ma trận là đủ. Với hàng chục triệu, cần chỉ mục xấp xỉ (ANN,
approximate nearest neighbour) như trong FAISS, Qdrant, Milvus, pgvector. Lưu ý vector store chỉ
là một cách tìm kiếm; nhiều hệ thống tốt vẫn giữ song song chỉ mục từ khoá kiểu BM25 (thuật
toán xếp hạng theo tần suất từ, như công cụ tìm kiếm truyền thống) vì embedding hay trượt các
chuỗi chính xác như mã lỗi, mã sản phẩm, tên hàm.

### Phía query (online)

**Query processing (xử lý câu hỏi).** Tối thiểu là embed câu hỏi bằng *cùng* embedding model đã
dùng khi index (dùng khác model là lỗi kinh điển, vì hai không gian vector không so được với
nhau). Phức tạp hơn là viết lại câu hỏi cho rõ, tách câu hỏi kép, thêm bộ lọc metadata suy ra từ
câu hỏi ("phiên bản mới nhất", "phòng kế toán").

**Retrieve (truy xuất).** Lấy top-k chunk gần nhất với vector câu hỏi, có thể kết hợp với kết
quả BM25. Khi trộn hai danh sách xếp hạng từ hai hệ thống khác nhau, cách phổ biến là Reciprocal
Rank Fusion: điểm của một tài liệu bằng tổng `1 / (k + hạng)` trên từng danh sách, với k = 60
trong bài gốc ([Cormack, Clarke, Büttcher, 2009](http://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)).
Ở bước này ta cố tình lấy rộng, ví dụ 20-50 chunk, chấp nhận nhiễu, để không bỏ sót.

**Rerank (xếp hạng lại).** Một mô hình thứ hai, gọi là reranker hoặc cross-encoder, đọc *cặp*
(câu hỏi, chunk) và chấm điểm liên quan chính xác hơn nhiều so với so sánh hai vector độc lập.
Nó chậm hơn nên chỉ chạy trên 20-50 ứng viên, rồi giữ lại 3-5 chunk tốt nhất. Lý do có bước này:
embedding search tối ưu cho *recall* (không bỏ sót), reranker tối ưu cho *precision* (cái gì vào
prompt phải thực sự liên quan).

**Build prompt (xây prompt, còn gọi là augmentation).** Ghép system prompt (vai trò, quy tắc
"chỉ dùng context", yêu cầu trích dẫn), các chunk đã chọn kèm nhãn nguồn, và câu hỏi. Ở đây cũng
quyết định thứ tự chunk, cắt bớt khi vượt ngân sách token, và khử trùng lặp.

**Generate (sinh câu trả lời).** LLM đọc prompt và viết câu trả lời kèm trích dẫn. Phần "kèm
trích dẫn" không tự có; nó đến từ việc prompt có nhãn `[1]`, `[2]` và câu lệnh bắt buộc ghi
nguồn. Sau đó có thể kiểm tra: trích dẫn có trỏ tới chunk thật không, câu trả lời có mâu thuẫn
với context không.

## 5. Flow của RAG qua từng khối: một ví dụ từ đầu đến cuối

Quay lại ví dụ sổ tay nhân viên, và đi qua từng khối với dữ liệu cụ thể. Các con số là minh
hoạ nhưng đúng tỷ lệ với những gì bạn sẽ gặp.

### Offline: indexing cuốn sổ tay

Nguồn: 14 file, gồm `remote-work-v3.pdf` (6 trang, cập nhật 03/2026), `remote-work-v2.pdf` (bản
cũ, 2024), `leave-policy.pdf`, `onboarding.md`, và một số file khác.

**Load.** Đầu vào: 14 file. Đầu ra: 14 bản ghi `{text, metadata}`. Ví dụ metadata của file quy
định làm việc từ xa: `{source: "remote-work-v3.pdf", version: 3, updated: "2026-03", dept: "HR"}`.
Quyết định quan trọng ngay tại đây: đánh dấu v2 là `superseded: true` để sau này lọc bỏ, hoặc
không index nó. Nếu bạn index cả hai mà không có metadata, retriever sẽ trả về cả "2 ngày/tuần"
của bản cũ và mô hình phải đoán.

**Parse và chunk.** Đầu vào: 14 bản ghi văn bản. Đầu ra: khoảng 180 chunk, mỗi chunk ~300 token,
chồng lấn 50 token, mỗi chunk kế thừa metadata của tài liệu cha cộng thêm `section` và `page`.
Chunk số 12 chính là đoạn mục 2.1 ở trên. Chunk 13 là mục 2.2 về trợ cấp thiết bị. Chunk 14 là
mục 2.3 về đăng ký HR.

**Embed.** Đầu vào: 180 đoạn văn. Đầu ra: 180 vector, mỗi vector 1.536 số thực. Gọi embedding
model theo lô (batch), tốn vài giây và vài xu. Chạy một lần; chỉ chạy lại cho chunk của file
thay đổi.

**Vector store.** Đầu vào: 180 bộ `(id, vector, text, metadata)`. Đầu ra: một chỉ mục sẵn sàng
trả lời truy vấn láng giềng gần nhất, cộng một chỉ mục BM25 trên cùng 180 đoạn. Với 180 chunk,
"vector store" có thể là một file. Bước indexing kết thúc ở đây; đến lúc này chưa có LLM nào được
gọi.

### Online: trả lời một câu hỏi

Câu hỏi: *"Nhân viên đang thử việc được làm việc từ xa mấy ngày một tuần?"*

**Query processing.** Đầu vào: chuỗi câu hỏi. Đầu ra: vector câu hỏi (1.536 số, cùng model với
lúc index), danh sách từ khoá cho BM25 (`thử việc`, `làm việc từ xa`, `ngày`, `tuần`), và bộ lọc
metadata `superseded != true`. Chưa cần viết lại câu hỏi vì nó đã rõ.

**Retrieve.** Đầu vào: vector câu hỏi, từ khoá, bộ lọc. Đầu ra: 20 ứng viên với điểm. Vector
search trả về chunk 12 (cosine 0,83), chunk 14 (0,71), chunk 13 (0,66), một chunk trong
`leave-policy.pdf` về "nghỉ phép trong thử việc" (0,64), rồi các chunk nhạt dần. BM25 cũng xếp
chunk 12 đầu vì khớp cả "thử việc" lẫn "làm việc từ xa". Trộn bằng RRF, chunk 12 đứng đầu với
cách biệt lớn. Nếu không có bộ lọc, chunk của v2 cũng lọt vào với cosine ~0,80 vì câu chữ gần
giống hệt; đó là lý do metadata quan trọng hơn thuật toán tìm kiếm.

**Rerank.** Đầu vào: 20 cặp (câu hỏi, chunk). Đầu ra: 3 chunk, xếp lại. Reranker cho chunk 12
điểm rất cao (nó chứa đúng câu trả lời), chunk 14 điểm trung bình (thủ tục liên quan), và hạ
chunk về nghỉ phép xuống dưới vì tuy có "thử việc" nhưng không nói về làm từ xa. Giữ 12, 14, 13.

**Build prompt.** Đầu vào: system prompt, 3 chunk, câu hỏi. Đầu ra: prompt khoảng 600 token, đúng
dạng ở mục 3, với nhãn `[1]` cho chunk 12, `[2]` cho chunk 14, `[3]` cho chunk 13. Chunk 13 có
thể bị bỏ nếu ngân sách token chặt; ở đây giữ để mô hình có thêm ngữ cảnh.

**Generate.** Đầu vào: prompt 600 token. Đầu ra: câu trả lời ~80 token với hai trích dẫn, như ở
mục 3. Một bước kiểm tra nhẹ sau đó: mọi `[n]` trong câu trả lời đều tồn tại trong prompt. Nếu mô
hình trả lời mà không trích dẫn, hoặc trích dẫn `[4]` không có thật, hệ thống nên từ chối hoặc
sinh lại.

Tổng chi phí cho một câu hỏi: một lần gọi embedding (rất rẻ), một lần tìm kiếm cục bộ, một lần
reranker trên 20 cặp, và một lần gọi LLM với 600 token đầu vào. So với việc dán cả 14 file
(khoảng 60.000 token) vào mỗi câu hỏi, rẻ hơn hai bậc và chính xác hơn, vì mô hình không phải
tìm kim trong đống rơm.

## 6. RAG, fine-tuning, hay cứ dùng context window dài?

Ba hướng này hay bị đặt lên bàn cân như thể loại trừ nhau. Thực ra chúng trả lời ba câu hỏi
khác nhau.

| Tiêu chí | RAG | Fine-tuning | Context dài |
|---|---|---|---|
| Thêm sự kiện mới | Tốt, sửa tài liệu là xong | Kém, tốn và không chắc nhớ | Tốt nếu vừa cửa sổ |
| Dữ liệu đổi thường xuyên | Rất hợp | Không hợp | Hợp nếu kho nhỏ |
| Trích dẫn nguồn | Có sẵn | Không | Có, nếu prompt gắn nhãn |
| Đổi giọng, định dạng, kỹ năng | Không | Hợp nhất | Một phần, qua ví dụ |
| Chi phí mỗi câu hỏi | Thấp, vài chunk | Thấp nhất | Cao, tỷ lệ với kho |
| Độ phức tạp hệ thống | Trung bình | Cao lúc đầu | Thấp nhất |

**Fine-tuning** dạy mô hình *cách làm* (giọng văn, định dạng đầu ra, một kỹ năng hẹp), không
phải *điều gì đúng hôm nay*. Nếu bạn cần mô hình luôn trả lời theo đúng một schema JSON hoặc
theo phong cách thương hiệu, fine-tuning là công cụ đúng, và nó kết hợp tốt với RAG chứ không
thay thế.

**Context dài** là lựa chọn đúng khi kho của bạn nhỏ. Bài viết về Contextual Retrieval của
Anthropic nói thẳng: nếu toàn bộ kho kiến thức dưới khoảng 200.000 token (tầm 500 trang), bạn có
thể đưa cả kho vào prompt, dùng prompt caching để giảm chi phí và độ trễ, và không cần RAG
([Anthropic, Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)). Khi
kho lớn hơn, hoặc khi mỗi câu hỏi chỉ cần một phần rất nhỏ của kho, RAG thắng về cả chi phí lẫn
độ chính xác vì hiệu ứng "lost in the middle" ở trên.

## 7. Khi nào RAG không phải công cụ đúng

Một hệ thống tốt là hệ thống đơn giản nhất đạt yêu cầu. Hãy cân nhắc không dùng RAG khi:

- Kho tài liệu nhỏ và ổn định: dán thẳng vào prompt, cache lại, đo chất lượng. Chỉ chuyển sang RAG khi chi phí hoặc độ chính xác không đạt.
- Câu hỏi cần nhìn toàn bộ kho: "tóm tắt mọi thay đổi chính sách năm nay", "có bao nhiêu hợp đồng hết hạn tháng sau". RAG lấy *mảnh*, không lấy *toàn cục*. Các câu này cần tổng hợp theo lô hoặc truy vấn dữ liệu có cấu trúc.
- Dữ liệu vốn có cấu trúc: nếu câu trả lời là một truy vấn SQL trên bảng nhân sự, hãy để mô hình sinh SQL (hoặc gọi tool), đừng embed từng dòng bảng.
- Vấn đề nằm ở hành vi, không ở kiến thức: mô hình biết đủ nhưng trả lời sai định dạng, sai giọng. Đó là việc của prompt hoặc fine-tuning.
- Kiến thức chung mà mô hình đã có: hỏi về cú pháp Python chuẩn thì RAG chỉ thêm độ trễ.
- Bạn chưa có cách đo: RAG có nhiều chỗ để hỏng im lặng (parse, chunk, retrieval, prompt). Nếu chưa có bộ câu hỏi vàng để kiểm tra, hãy làm bộ đó trước khi dựng pipeline.

Và ngay cả khi RAG là lựa chọn đúng, hãy bắt đầu từ phiên bản ngây thơ nhất: chunk cố định,
một embedding model, top-5, một prompt rõ ràng. Đo. Rồi mới thêm BM25, reranker, viết lại câu
hỏi, từng thứ một, khi số đo cho thấy cần.

## 8. Điều RAG "trên giấy" chưa giải quyết được

> Nếu chỉ nhớ một điều: LLM có hai nguồn thông tin, tham số và prompt. Tham số thì bạn không
> kiểm soát được. RAG là kỷ luật đưa đúng thứ vào prompt.

Bài này cố tình không dùng framework nào, để bạn thấy RAG chỉ là: chuẩn bị sách, lật đúng trang,
bắt mô hình đọc trang đó rồi mới trả lời. Ý tưởng đơn giản vậy, nhưng khi bắt tay vào làm thật,
bạn sẽ thấy nó là một đống mảnh rời phải dán lại với nhau: đọc file, cắt chunk, gọi embedding
model, ghi vào vector store, gọi LLM. Mỗi nhà cung cấp lại có một cách gọi riêng cho từng mảnh.
Muốn đổi embedding model hay đổi vector store là phải viết lại mớ code dán ở giữa, và pipeline
nhanh chóng thành một mớ khó đọc, khó thay. Đó chính là chỗ LangChain xuất hiện: cho mỗi mảnh
một "hình dạng" chuẩn để chúng lắp vào nhau và thay được.
[Bài 2](#/blog/langchain-rag-from-scratch) bắt đầu từ đúng chỗ này và dựng lại pipeline trên
bằng LangChain, với cấu trúc thư mục mà nhìn vào là thấy từng khối.
