---
title: "LangChain là gì, và build RAG from scratch với LangChain"
date: "2026-10-24"
tags: ["langchain", "rag", "python"]
summary: "LangChain sinh ra để giải quyết vấn đề gì, từng component dùng cho RAG và Agent ra sao, rồi một codebase RAG mà nhìn cây thư mục là hiểu pipeline."
---

# LangChain là gì, và build RAG from scratch với LangChain

Ở [bài 1](#/blog/rag-fundamentals) mình đã thấy RAG giải quyết chuyện LLM không biết dữ liệu
của bạn: tìm đúng đoạn tài liệu, đưa vào context, model trả lời có căn cứ. Ý tưởng thì đơn
giản. Nhưng khi bắt tay vào làm thật, bạn sẽ thấy RAG không phải một thứ mà là năm sáu thứ
rời rạc phải dán lại với nhau: đọc file, cắt nhỏ, embedding, vector store, rồi LLM. Mỗi hãng
lại có cách làm riêng cho từng mảnh, nên đổi một mảnh là phải viết lại phần dán. Bài này nói
về công cụ sinh ra để sửa đúng điểm yếu đó: LangChain. Phần đầu giải thích LangChain giải
quyết vấn đề gì và từng component của nó dùng ở đâu trong RAG, ở đâu trong Agent. Phần sau
build một hệ RAG nhỏ, chạy được trên máy, với cấu trúc thư mục mà nhìn qua là thấy pipeline.

Mọi API trong bài được kiểm tra trên **LangChain 1.x** tại thời điểm viết (28/10/2026, theo
PyPI): `langchain` 1.4.7, `langchain-core` 1.7.1, `langgraph` 1.2.18,
`langchain-text-splitters` 1.1.3, `langchain-chroma` 1.1.0, `langchain-ollama` 1.1.0,
`langchain-openai` 1.7.3. Yêu cầu Python 3.10 trở lên. Tôi nói rõ vì import path của LangChain
đổi khá nhiều giữa 0.x và 1.x; code copy từ bài viết cũ thường không chạy nữa.

## 1. LangChain sinh ra để giải quyết vấn đề gì

Nói nôm na là thế này. Hình dung bạn mua đồ điện ở năm nước khác nhau, mỗi cái một kiểu phích
cắm. Muốn dùng được thì bạn phải tự chế một cục chuyển đổi cho từng cái, và hôm nào đổi sang
cái máy khác là lại chế cục mới. LangChain là cái ổ cắm chuẩn: mọi mảnh của RAG đều được làm
cho ra cùng một hình phích, nên bạn cắm cái nào vào cũng vừa, và rút cái này ra thay cái khác
mà không phải đụng vào phần còn lại. Nói cách khác, nó biến đống mảnh rời của [bài 1](#/blog/rag-fundamentals) thành
những viên Lego ăn khớp với nhau.

Cụ thể hơn, nếu bạn tự viết RAG không dùng framework thì sẽ gặp gì? Bạn cần: gọi API của một
nhà cung cấp model (OpenAI, Anthropic, Google, hay Ollama chạy local), mỗi hãng một format
request và response khác nhau; đọc file PDF, Markdown, HTML; cắt text thành đoạn; gọi một API
embedding khác; lưu vector vào một database; viết hàm tìm kiếm; ghép prompt; parse kết quả.
Chừng đó việc là chừng đó đoạn glue code (code dán). Rồi một ngày bạn muốn đổi từ GPT sang
Claude để so sánh, hay đổi vector store từ Chroma sang Postgres, và nhận ra code dán dính chặt
vào hãng cũ.

LangChain tự mô tả mục tiêu của nó trong
[trang triết lý thiết kế](https://docs.langchain.com/oss/python/langchain/philosophy): các
nhà cung cấp "expose different APIs, with different model parameters and different message
formats", nên "standardizing these model inputs and outputs is a core focus". Nói ngắn gọn,
LangChain giải quyết hai việc:

- **Chuẩn hoá interface.** Chat model nào cũng có `invoke`, `stream`, `bind_tools`, `with_structured_output`. Vector store nào cũng có `add_documents`, `similarity_search`, `as_retriever`. Đổi hãng là đổi một dòng khởi tạo, không phải viết lại pipeline.
- **Ghép nối (composition).** Các mảnh được thiết kế để cắm vào nhau: loader đưa ra `Document`, splitter nhận `Document`, vector store nhận `Document`, retriever trả về `Document`. Cùng một kiểu dữ liệu chảy xuyên suốt, nên lắp ráp pipeline giống lắp Lego.

Cái tên "chain" đến từ thời kỳ đầu, khi mọi thứ là chuỗi bước định trước. Sau đó LangChain bổ
sung LCEL (ngôn ngữ ghép chain bằng toán tử `|`), rồi LangGraph cho các luồng có vòng lặp và
trạng thái, và đến bản 1.0 thì thay toàn bộ chain và agent cũ bằng một abstraction duy nhất,
`create_agent`, chạy trên LangGraph. Ta sẽ gặp lại từng lớp này bên dưới.

### Các package hiện tại

LangChain 1.x không phải một package mà là một họ package. Biết cái gì nằm ở đâu giúp bạn
đọc lỗi import nhanh hơn nhiều.

| Package | Chứa gì | Khi nào cần |
|---|---|---|
| `langchain-core` | Interface gốc: `Runnable`, `Document`, messages, prompt, parser | Luôn (được kéo theo) |
| `langchain` | `create_agent`, `init_chat_model`, `init_embeddings`, middleware; re-export core | Luôn |
| `langchain-openai`, `-anthropic`, `-ollama`, ... | Partner package: adapter cho từng hãng model | Theo hãng bạn dùng |
| `langchain-chroma`, `-qdrant`, `-postgres`, ... | Partner package cho vector store | Theo store bạn dùng |
| `langchain-text-splitters` | Các text splitter | Khi cắt chunk |
| `langgraph` | Runtime: graph, state, checkpointer | Agent, hoặc luồng có vòng lặp |
| `langchain-classic` | Chain, retriever, indexing API đời cũ | Chỉ khi port code 0.x |
| `langchain-community` | Integration cộng đồng (PDF loader, FAISS...) | Đang bị sunset, xem bên dưới |

Hai điểm cần biết. Thứ nhất, theo
[release notes v1](https://docs.langchain.com/oss/python/releases/langchain-v1), các chain
kiểu `RetrievalQA`, `MultiQueryRetriever`, module `langchain.retrievers` và indexing API đã
chuyển sang `langchain-classic`; ai tìm thấy code mẫu dùng chúng thì hiểu đó là API cũ. Thứ
hai, `langchain-community` đã
[được tuyên bố sunset](https://github.com/langchain-ai/langchain-community/issues/674) từ
tháng 5/2026: vẫn cài được, nhưng không còn bảo trì, và hướng đi là dùng package riêng cho từng
integration (ví dụ `langchain-docling`, `langchain-unstructured` cho loader). Trong dự án mẫu
bên dưới tôi tránh phụ thuộc vào nó.

## 2. Các component, và vai trò trong RAG lẫn Agent

Trước khi đi từng cái, hãy nhìn bức tranh chung: mọi component cắm vào nhau thế nào trong một
chain RAG, và biến thể agent khác ở chỗ nào.

![Các component LangChain ghép thành một chain RAG: hàng trên là indexing offline (loader, splitter, embeddings, vector store), hàng dưới là query online (retriever, prompt, chat model, parser), bên dưới là biến thể agent và LangSmith tracing](blog/langchain-rag-from-scratch-components.svg)

### Chat models

Chat model là adapter nói chuyện với LLM. Nó nhận một danh sách message, trả về một
`AIMessage`. Trong 1.x, cách khởi tạo khuyến nghị là `init_chat_model` với chuỗi
`"provider:model"`; LangChain tự import partner package tương ứng.

```python
from langchain.chat_models import init_chat_model

llm = init_chat_model("ollama:llama3.1", temperature=0)   # local
# llm = init_chat_model("openai:gpt-5.5", temperature=0)  # hosted
reply = llm.invoke("Giải thích embedding trong một câu.")
print(reply.content)
```

Ba method bạn sẽ dùng nhiều: `invoke` (gọi một lần), `stream` (nhận từng mẩu để hiện dần lên
UI), và `bind_tools` (khai báo tool để model có thể yêu cầu gọi). `with_structured_output`
ép model trả về đúng một schema Pydantic.

- **Trong RAG:** đứng cuối chain, nhận prompt đã có context và sinh câu trả lời. `temperature=0` để kết quả ổn định và bám tài liệu.
- **Trong Agent:** là "bộ não" của vòng lặp: mỗi vòng model nhìn lịch sử và quyết định gọi tool nào hay trả lời luôn. Cần model hỗ trợ tool calling.

### Messages

Message là đơn vị hội thoại: `SystemMessage` (chỉ dẫn), `HumanMessage` (người dùng),
`AIMessage` (model), `ToolMessage` (kết quả của một tool, phải mang `tool_call_id` khớp với
yêu cầu gọi trong `AIMessage`). Bạn có thể viết dạng dict `{"role": "user", "content": ...}`
hoặc import class từ `langchain.messages`. Bản 1.x thêm thuộc tính `content_blocks`: một cách
nhìn chuẩn hoá nội dung (text, reasoning, tool call, citation) giống nhau giữa các hãng, theo
[tài liệu messages](https://docs.langchain.com/oss/python/langchain/messages).

- **Trong RAG:** thường chỉ có system + human; context nằm trong system message.
- **Trong Agent:** toàn bộ lịch sử là một list message; `ToolMessage` là cách kết quả tool quay lại model.

### Prompt templates

Template là prompt có chỗ trống. `ChatPromptTemplate.from_messages` nhận list các cặp
`(role, text)`; `{context}` và `{question}` được điền lúc chạy. `MessagesPlaceholder` chèn cả
một list message (lịch sử chat) vào giữa.

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "Chỉ trả lời từ context sau. Trích dẫn [n].\n\n{context}"),
    ("human", "{question}"),
])
messages = prompt.invoke({"context": "...", "question": "..."}).to_messages()
```

- **Trong RAG:** đây là nơi quy tắc grounding sống: "chỉ dùng context, không có thì nói không có, trích dẫn nguồn".
- **Trong Agent:** `create_agent` nhận thẳng `system_prompt` dạng string; template dùng khi bạn cần prompt động theo người dùng (qua middleware).

### Output parsers và structured output

Parser biến `AIMessage` thành thứ code dùng được. `StrOutputParser` lấy text ra.
`PydanticOutputParser` parse JSON theo schema. Nhưng tài liệu
[output parsers](https://reference.langchain.com/python/langchain_core/output_parsers/) nói
rõ: "most LLMs support structured output natively", nên khi cần JSON có cấu trúc, hãy dùng
`llm.with_structured_output(Schema)` hoặc `response_format=Schema` trên `create_agent`
(kết quả nằm ở `result["structured_response"]`). Parser chỉ còn cần cho model không hỗ trợ.

- **Trong RAG:** `StrOutputParser` ở cuối chain là đủ; hoặc structured output nếu bạn muốn `{"answer": ..., "citations": [...]}` tách riêng.
- **Trong Agent:** `response_format` để agent kết thúc bằng một object đã validate.

### Document loaders

Loader đọc nguồn dữ liệu (file, URL, database) và trả về list `Document`: object có
`page_content` (text) và `metadata` (dict tuỳ ý, thường là `source`, `title`, `page`). Mọi
loader kế thừa `BaseLoader` trong `langchain-core` với hai method `load()` và
`lazy_load()` (stream từng tài liệu, tốt cho corpus lớn). Viết loader riêng chỉ mất mười
dòng, và cho corpus Markdown tôi thích tự viết hơn kéo thêm dependency.

- **Trong RAG:** bước đầu tiên của indexing. Metadata bạn gắn ở đây sẽ đi theo chunk đến tận câu trả lời, nên nghĩ về citation ngay từ loader.
- **Trong Agent:** ít khi gọi trực tiếp; agent thường dùng tool bọc quanh retriever đã index sẵn. Một tool "fetch URL" cũng là một dạng loader chạy lúc runtime.

### Text splitters

Splitter cắt `Document` dài thành chunk vừa để tìm và vừa context window. Package riêng là
`langchain-text-splitters`. Điểm xuất phát mà tài liệu khuyên là
`RecursiveCharacterTextSplitter`: nó cố giữ nguyên đoạn văn, không được thì lùi xuống câu, rồi
từ. `add_start_index=True` ghi vị trí ký tự của chunk vào metadata, rất tiện để tạo id ổn
định. Ngoài ra có `MarkdownHeaderTextSplitter` (cắt theo heading, giữ heading làm metadata)
và `CharacterTextSplitter.from_tiktoken_encoder` (đếm theo token thay vì ký tự).

- **Trong RAG:** quyết định chất lượng retrieval nhiều hơn mọi thứ khác; [bài 3](#/blog/rag-production-techniques) bàn kỹ.
- **Trong Agent:** không có vai trò lúc runtime, trừ khi agent tự index tài liệu mới.

### Embeddings

Embedding là một danh sách số biểu diễn ý nghĩa của text, sao cho hai đoạn cùng nghĩa có hai
vector gần nhau. Interface có hai method: `embed_documents(list[str])` khi index và
`embed_query(str)` khi hỏi. Khởi tạo bằng `init_embeddings("provider:model")`, cùng kiểu với
chat model.

```python
from langchain.embeddings import init_embeddings

emb = init_embeddings("ollama:nomic-embed-text")
# emb = init_embeddings("openai:text-embedding-3-small")
vec = emb.embed_query("rotate API keys")
print(len(vec))  # số chiều, ví dụ 768
```

Một nguyên tắc không được phá: **câu hỏi và tài liệu phải được embed bằng cùng một model.**
Đổi model embedding là phải index lại toàn bộ.

- **Trong RAG:** dùng ở cả hai pha, index và query.
- **Trong Agent:** gián tiếp, qua retriever trong tool; hoặc cho long-term memory có tìm kiếm ngữ nghĩa.

### Vector stores

Vector store lưu vector cùng `Document` gốc và tìm k vector gần nhất với vector câu hỏi.
Interface chung: `add_documents(docs, ids=...)`, `similarity_search(query, k)`,
`similarity_search_with_score`, `as_retriever()`. Lựa chọn chạy local: `InMemoryVectorStore`
(trong `langchain-core`, mất khi tắt process, hợp để test), **Chroma** (`langchain-chroma`,
lưu ra thư mục, không cần server), FAISS (`langchain-community`, nhanh nhưng là thư viện chỉ
mục thuần, bạn tự lo lưu trữ). Khi cần nhiều tiến trình đọc ghi, lọc metadata phức tạp hay
dữ liệu lớn hơn RAM: pgvector (`langchain-postgres`), Qdrant, Milvus, Pinecone.

- **Trong RAG:** là "bộ nhớ" của hệ thống; ghi lúc index, đọc lúc query.
- **Trong Agent:** là backend của tool tìm kiếm; agent không thấy nó trực tiếp.

### Retrievers

Retriever là interface hẹp: nhận một string, trả về `list[Document]`. Điểm đáng giá là nó là
một `Runnable`, nên có `invoke`, `batch`, `stream`, `ainvoke` và cắm thẳng vào chain. Lấy từ
vector store bằng `as_retriever(search_type=..., search_kwargs={"k": 4})`; `search_type` nhận
`"similarity"`, `"mmr"` (giảm trùng lặp giữa các kết quả) hoặc
`"similarity_score_threshold"`. Retriever không nhất thiết phải là vector search: một hàm
gọi BM25, SQL hay API, bọc bằng decorator `@chain`, cũng là retriever.

- **Trong RAG:** mắt xích nối pha index và pha sinh câu trả lời.
- **Trong Agent:** bọc trong `@tool` để model gọi khi nó thấy cần.

### LCEL và Runnables

`Runnable` là interface chung của mọi thứ trong LangChain: prompt, model, parser, retriever,
và cả graph đã compile của LangGraph. LCEL (LangChain Expression Language) là cách ghép chúng
bằng toán tử `|`: output của bên trái thành input bên phải. Vài primitive hay dùng:
`RunnablePassthrough` (chuyển tiếp input nguyên vẹn), `RunnableParallel` (chạy nhiều nhánh,
gom thành dict), `RunnableLambda` (bọc hàm Python thường), và
`RunnablePassthrough.assign(key=...)` (thêm một key vào dict đang chảy qua).

Cái bạn được miễn phí khi ghép bằng LCEL: `invoke`, `batch`, `stream` và các bản async hoạt
động trên cả chain mà không viết thêm; và mỗi bước tự thành một span khi bật tracing.

- **Trong RAG:** rất hợp với RAG hai bước (retrieve rồi generate), vì luồng là tuyến tính và không có trạng thái.
- **Trong Agent:** LCEL không mô tả được vòng lặp hay rẽ nhánh theo kết quả. Đó là lý do LangGraph tồn tại, và `create_agent` là graph dựng sẵn cho vòng lặp phổ biến nhất.

### Tools

Tool là hàm Python mà model được phép yêu cầu gọi. Decorator `@tool` lấy **type hint** làm
schema tham số và **docstring** làm mô tả cho model; theo
[tài liệu tools](https://docs.langchain.com/oss/python/langchain/tools), type hint là bắt
buộc. Tham số `runtime: ToolRuntime` cho tool đọc state, context, store mà không lộ ra với
model.

```python
from langchain.tools import tool

@tool
def search_docs(query: str) -> str:
    """Tìm trong tài liệu nội bộ. Trả về các đoạn đánh số kèm nguồn."""
    return format_docs(retriever.invoke(query))
```

- **Trong RAG:** không cần, retriever gọi trực tiếp trong chain.
- **Trong Agent:** là mọi thứ agent có thể làm. Tool tốt có tên rõ, docstring nói khi nào dùng, và trả về text mà model đọc được (đánh số nguồn để model trích dẫn).

### Agents và quan hệ với LangGraph

Agent là vòng lặp: model nhìn message, hoặc trả lời, hoặc yêu cầu gọi tool; tool chạy; kết
quả thành `ToolMessage` nối vào lịch sử; lặp lại cho đến khi model ngừng gọi tool. Trong 1.x,
`create_agent` (thay cho `create_react_agent` và `AgentExecutor` cũ) dựng vòng lặp này và trả
về một `CompiledStateGraph` của LangGraph. Nghĩa là bạn nhận luôn persistence (checkpointer),
streaming, human-in-the-loop và time travel mà không phải học LangGraph, như
[trang overview](https://docs.langchain.com/oss/python/langchain/overview) nói: "LangChain's
agents are built on top of LangGraph."

Tính năng định hình của `create_agent` là **middleware**: các hook `before_model`,
`after_model`, `wrap_tool_call`... để tóm tắt lịch sử, che PII, bắt duyệt tay trước tool
nhạy cảm. Khi bạn cần luồng không khớp với "một vòng lặp model-tool" (nhiều agent, rẽ nhánh
định trước, chờ con người ở giữa), bạn xuống thẳng LangGraph và tự vẽ graph.
[Bài 4](#/blog/langgraph-ai-agents) của series dành riêng cho việc đó.

### Memory và chat history

Với chain RAG hai bước, "memory" là bạn tự giữ list message và chèn vào prompt qua
`MessagesPlaceholder`. Với agent, lịch sử nằm trong state của graph; truyền
`checkpointer=InMemorySaver()` (hoặc `PostgresSaver` cho production) và gọi với
`{"configurable": {"thread_id": "..."}}`; cùng `thread_id` là cùng cuộc hội thoại. Khi lịch
sử dài, `SummarizationMiddleware` tóm tắt phần cũ thay vì cắt bỏ, theo
[tài liệu short-term memory](https://docs.langchain.com/oss/python/langchain/short-term-memory).

### Callbacks và tracing với LangSmith

Mọi `Runnable` phát ra event khi bắt đầu, kết thúc, lỗi. LangSmith là dịch vụ nhận các event
đó thành trace: bạn thấy câu hỏi, các chunk retriever trả về, prompt cuối cùng gửi đi, token
và thời gian của từng bước. Bật bằng hai biến môi trường, không đổi code:
`LANGSMITH_TRACING=true` và `LANGSMITH_API_KEY=...`, theo
[hướng dẫn tracing](https://docs.langchain.com/langsmith/trace-with-langchain). Với RAG,
đây là cách nhanh nhất để trả lời câu hỏi muôn thuở "model bịa hay retriever lấy sai đoạn?".
Với agent, trace cho thấy chuỗi tool call mà model đã quyết định.

### Bảng tổng hợp

| Component | Vai trò trong RAG | Vai trò trong Agent |
|---|---|---|
| Chat model | Sinh câu trả lời từ prompt có context | Bộ não của vòng lặp, quyết định gọi tool |
| Messages | System + human | Toàn bộ lịch sử, gồm ToolMessage |
| Prompt template | Quy tắc grounding, chỗ trống cho context | system_prompt, prompt động qua middleware |
| Output parser / structured | Lấy text; JSON nếu cần | response_format cho kết quả cuối |
| Document loader | Đọc nguồn thành Document | Tool fetch dữ liệu lúc runtime |
| Text splitter | Cắt chunk khi index | Hầu như không dùng |
| Embeddings | Index và query | Gián tiếp qua retriever trong tool |
| Vector store | Lưu và tìm chunk | Backend của tool tìm kiếm |
| Retriever | Nối index với generation | Bọc thành tool |
| LCEL / Runnable | Ghép chain tuyến tính | Mỗi node, tool đều là Runnable |
| Tools | Không cần | Mọi hành động của agent |
| Agent / LangGraph | Chỉ khi cần agentic RAG | Vòng lặp model-tool, state, checkpoint |
| Memory | Tự giữ history, MessagesPlaceholder | checkpointer + thread_id |
| Tracing | Debug retrieval và prompt | Theo dõi chuỗi tool call |

### RAG hai bước hay agentic RAG?

Tài liệu [retrieval](https://docs.langchain.com/oss/python/langchain/retrieval) tách bạch
hai kiểu. **RAG hai bước**: luôn retrieve rồi generate; số lần gọi model có cận trên cố định,
độ trễ đoán được, dễ test; hợp FAQ, docs bot. **Agentic RAG**: model quyết định khi nào và
tìm gì, có thể tìm nhiều lần; linh hoạt hơn, nhưng độ trễ và chi phí biến thiên, và khó đánh
giá hơn. Lời khuyên của tôi: bắt đầu bằng hai bước. Chỉ chuyển sang agent khi bạn đo được
rằng câu hỏi thực tế cần nhiều lượt tìm (so sánh nhiều tài liệu, hỏi nối tiếp) và chain
thẳng không đủ.

> Framework không thay thế hiểu biết: LangChain giúp bạn đổi mảnh ghép nhanh, không giúp bạn biết mảnh nào cần đổi. Cái thứ hai đến từ đo lường.

## 3. Build RAG from scratch với LangChain

Bài toán: một bot hỏi đáp trên tài liệu nội bộ của team (thư mục Markdown: runbook, hướng dẫn
onboarding, quyết định kiến trúc). Yêu cầu: chạy hoàn toàn local bằng Ollama, trả lời có
trích dẫn nguồn, có CLI và một endpoint HTTP, đổi sang model hosted chỉ bằng biến môi trường.

### Cấu trúc thư mục

Nguyên tắc đặt tên: mỗi thư mục là một giai đoạn của pipeline, mỗi file là một component của
LangChain. Ai mới vào dự án chỉ cần đọc cây này là biết dữ liệu đi đường nào.

```text
docs-rag/
├── pyproject.toml            # deps: langchain, langchain-chroma, langchain-ollama...
├── .env.example              # CHAT_MODEL, EMBEDDING_MODEL (provider:model)
├── data/
│   └── raw/                  # tài liệu nguồn (.md); git-tracked
├── storage/
│   └── chroma/               # index Chroma đã persist; gitignored, tạo lại bằng ingest
├── src/docs_rag/
│   ├── config.py             # Settings: tên model, đường dẫn, chunk_size, top_k
│   ├── ingestion/            # GIAI ĐOẠN 1: nguồn -> Document -> chunk
│   │   ├── loaders.py        #   Document loader: .md -> Document(page_content, metadata)
│   │   └── chunking.py       #   Text splitter: Document -> chunk, gắn chunk_id ổn định
│   ├── indexing/             # GIAI ĐOẠN 2: chunk -> vector -> store
│   │   ├── embeddings.py     #   init_embeddings(settings.embedding_model)
│   │   └── vectorstore.py    #   Chroma: add_documents / similarity_search, lưu ra disk
│   ├── retrieval/            # GIAI ĐOẠN 3: câu hỏi -> top-k chunk
│   │   └── retriever.py      #   as_retriever(k) + format_docs() đánh số [n] để citation
│   ├── generation/           # GIAI ĐOẠN 4: chunk + câu hỏi -> câu trả lời
│   │   ├── prompts.py        #   ChatPromptTemplate grounded, bắt buộc trích dẫn
│   │   ├── llm.py            #   init_chat_model(settings.chat_model)
│   │   └── chain.py          #   LCEL: retriever | prompt | model | parser, kèm sources
│   ├── api/
│   │   └── main.py           # FastAPI: POST /ask -> {answer, sources}
│   └── cli.py                # python -m docs_rag.cli ask "câu hỏi"
├── scripts/
│   └── ingest.py             # chạy offline: load -> split -> embed -> store
├── eval/
│   ├── golden.jsonl          # câu hỏi, đáp án mong đợi, nguồn mong đợi
│   └── run_eval.py           # hit-rate của retriever, kiểm tra citation
└── tests/
    ├── test_chunking.py      # splitter cho ra chunk đúng size, metadata đủ
    └── test_chain.py         # chạy chain với fake embeddings + fake chat model
```

Hai thư mục `ingestion` và `indexing` chỉ chạy offline (khi tài liệu đổi). `retrieval` và
`generation` chạy cho mỗi câu hỏi. Tách như vậy để cái chạy mỗi request không bao giờ kéo theo
code đọc file hay cắt chunk.

### Cài đặt

```bash
uv init docs-rag && cd docs-rag
uv add langchain langchain-ollama langchain-chroma langchain-text-splitters \
       fastapi "uvicorn[standard]"
# tuỳ chọn: uv add langchain-openai   (để đổi sang OpenAI bằng env)
ollama pull llama3.1
ollama pull nomic-embed-text
```

### config.py: một nơi cho mọi tham số

```python
# src/docs_rag/config.py
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    # Chuỗi "provider:model": init_chat_model / init_embeddings tự hiểu.
    chat_model: str = os.getenv("CHAT_MODEL", "ollama:llama3.1")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "ollama:nomic-embed-text")
    raw_dir: Path = ROOT / "data" / "raw"
    chroma_dir: Path = ROOT / "storage" / "chroma"
    collection: str = "docs"
    chunk_size: int = 800      # đếm theo ký tự
    chunk_overlap: int = 120   # ~15% để câu bị cắt đôi vẫn có mặt ở một chunk
    top_k: int = 4


settings = Settings()
```

Đổi `CHAT_MODEL=openai:gpt-5.5` trong `.env` là cả hệ thống chạy trên OpenAI; không file nào
khác biết chuyện đó. Đó chính là lợi ích "chuẩn hoá interface" ở phần 1, nhìn thấy được.

### ingestion/loaders.py: nguồn thành Document

```python
# src/docs_rag/ingestion/loaders.py
from collections.abc import Iterator
from pathlib import Path

from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document


class MarkdownDirLoader(BaseLoader):
    """Mỗi file .md thành một Document; metadata mang source và title để citation."""

    def __init__(self, root: Path, glob: str = "**/*.md") -> None:
        self.root, self.glob = root, glob

    def lazy_load(self) -> Iterator[Document]:
        for path in sorted(self.root.glob(self.glob)):
            text = path.read_text(encoding="utf-8")
            title = next(
                (line[2:] for line in text.splitlines() if line.startswith("# ")),
                path.stem,
            )
            yield Document(
                page_content=text,
                metadata={"source": str(path.relative_to(self.root)), "title": title},
            )
```

Chỉ cần định nghĩa `lazy_load`; `load()` kế thừa từ `BaseLoader` sẽ gom thành list. Với PDF,
thay class này bằng `DoclingLoader` từ `langchain-docling` (giữ được bảng và heading) hoặc
`PyPDFLoader` từ `langchain-community` nếu bạn chấp nhận package đang sunset. Phần còn lại
của pipeline không đổi, vì tất cả đều chỉ thấy `Document`.

### ingestion/chunking.py: Document thành chunk có id ổn định

```python
# src/docs_rag/ingestion/chunking.py
import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from docs_rag.config import settings


def split(docs: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        add_start_index=True,  # metadata["start_index"] = vị trí ký tự trong file gốc
    )
    chunks = splitter.split_documents(docs)
    for chunk in chunks:
        # id = hash(source, start_index): ingest lại không tạo bản sao trong store
        key = f"{chunk.metadata['source']}:{chunk.metadata['start_index']}"
        chunk.metadata["chunk_id"] = hashlib.sha1(key.encode()).hexdigest()[:16]
    return chunks
```

Cái `chunk_id` quan trọng hơn vẻ ngoài của nó. Nếu bạn gọi `add_documents` không có `ids`,
mỗi lần chạy ingest là thêm một bộ chunk trùng, retriever bắt đầu trả về bốn bản của cùng
một đoạn. Với id ổn định, Chroma upsert: chạy ingest mười lần vẫn chỉ có một bộ.

### indexing/embeddings.py và indexing/vectorstore.py

```python
# src/docs_rag/indexing/embeddings.py
from functools import lru_cache

from langchain.embeddings import init_embeddings
from langchain_core.embeddings import Embeddings

from docs_rag.config import settings


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    return init_embeddings(settings.embedding_model)
```

```python
# src/docs_rag/indexing/vectorstore.py
from functools import lru_cache

from langchain_chroma import Chroma

from docs_rag.config import settings
from docs_rag.indexing.embeddings import get_embeddings


@lru_cache(maxsize=1)
def get_vector_store() -> Chroma:
    return Chroma(
        collection_name=settings.collection,
        embedding_function=get_embeddings(),
        persist_directory=str(settings.chroma_dir),  # bỏ dòng này = chỉ trong RAM
    )
```

Tôi chọn Chroma vì nó persist ra một thư mục mà không cần server, đủ cho vài chục nghìn chunk,
và API của nó qua LangChain giống hệt mọi store khác. Muốn FAISS: thay body hàm bằng
`FAISS(embedding_function=..., index=faiss.IndexFlatL2(dim), docstore=InMemoryDocstore(),
index_to_docstore_id={})` và nhớ `save_local`/`load_local`. Muốn Postgres: `PGVector` từ
`langchain-postgres`. Không file nào khác phải sửa.

### scripts/ingest.py: nối giai đoạn 1 và 2

```python
# scripts/ingest.py
from docs_rag.config import settings
from docs_rag.indexing.vectorstore import get_vector_store
from docs_rag.ingestion.chunking import split
from docs_rag.ingestion.loaders import MarkdownDirLoader


def main() -> None:
    docs = MarkdownDirLoader(settings.raw_dir).load()      # loader
    chunks = split(docs)                                   # splitter
    store = get_vector_store()                             # embeddings + store
    store.add_documents(chunks, ids=[c.metadata["chunk_id"] for c in chunks])
    print(f"{len(docs)} documents -> {len(chunks)} chunks -> {settings.chroma_dir}")


if __name__ == "__main__":
    main()
```

Script này là toàn bộ pha indexing trong sáu dòng có nghĩa. `add_documents` tự gọi
`embed_documents` của model embedding rồi ghi vector và metadata vào Chroma.

### retrieval/retriever.py: câu hỏi thành top-k chunk đánh số

```python
# src/docs_rag/retrieval/retriever.py
from langchain_core.documents import Document

from docs_rag.config import settings
from docs_rag.indexing.vectorstore import get_vector_store


def get_retriever():
    # Runnable: nhận str, trả list[Document]; cắm thẳng vào chain được
    return get_vector_store().as_retriever(
        search_type="similarity", search_kwargs={"k": settings.top_k}
    )


def format_docs(docs: list[Document]) -> str:
    """Đánh số [1]..[k] để model trích dẫn và để API map ngược về nguồn."""
    parts = []
    for i, doc in enumerate(docs, start=1):
        src = doc.metadata.get("source", "?")
        parts.append(f"[{i}] ({src})\n{doc.page_content}")
    return "\n\n".join(parts)
```

`format_docs` là chỗ bạn quyết định model "nhìn thấy" context thế nào. Số thứ tự trong ngoặc
vuông là hợp đồng giữa prompt và API: model viết `[2]`, API biết `[2]` là file nào.

### generation/prompts.py: prompt grounded có trích dẫn

```python
# src/docs_rag/generation/prompts.py
from langchain_core.prompts import ChatPromptTemplate

SYSTEM = """You answer questions about the team's internal documentation.

Rules:
- Use ONLY the context below. If it does not contain the answer, say
  "I can't find this in the docs" and suggest what to search for instead.
- End every factual sentence with the bracket number of its source, like [1] or [2].
- Keep answers short. Never invent a source number that is not in the context.

Context:
{context}"""

RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system", SYSTEM),
    ("human", "{question}"),
])
```

Ba quy tắc, mỗi quy tắc chặn một kiểu lỗi: "only the context" chặn kiến thức ngoài, "say you
can't find" chặn bịa cho lịch sự, "never invent a source number" chặn citation ma. Prompt
viết tiếng Anh vì model nhỏ chạy local tuân thủ chỉ dẫn tiếng Anh tốt hơn; câu hỏi và trả
lời vẫn có thể tiếng Việt.

### generation/llm.py và generation/chain.py: ghép bằng LCEL

```python
# src/docs_rag/generation/llm.py
from functools import lru_cache

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from docs_rag.config import settings


@lru_cache(maxsize=1)
def get_llm() -> BaseChatModel:
    return init_chat_model(settings.chat_model, temperature=0)
```

```python
# src/docs_rag/generation/chain.py
from functools import lru_cache

from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (
    RunnableLambda, RunnableParallel, RunnablePassthrough,
)

from docs_rag.generation.llm import get_llm
from docs_rag.generation.prompts import RAG_PROMPT
from docs_rag.retrieval.retriever import format_docs, get_retriever


@lru_cache(maxsize=1)
def build_chain():
    # Nhánh sinh câu trả lời: dict{docs, question} -> prompt -> model -> str
    generate = (
        RunnableLambda(
            lambda x: {"context": format_docs(x["docs"]), "question": x["question"]}
        )
        | RAG_PROMPT
        | get_llm()
        | StrOutputParser()
    )
    # Chain đầy đủ: giữ lại docs để trả sources, thêm key "answer"
    return (
        RunnableParallel(docs=get_retriever(), question=RunnablePassthrough())
        | RunnablePassthrough.assign(answer=generate)
    )


def answer_question(question: str) -> dict:
    out = build_chain().invoke(question)
    return {
        "answer": out["answer"],
        "sources": [
            {"n": i, "source": d.metadata["source"], "title": d.metadata.get("title")}
            for i, d in enumerate(out["docs"], start=1)
        ],
    }
```

Đọc chain từ trên xuống: `RunnableParallel` nhận string câu hỏi, chạy song song hai nhánh
(retriever lấy docs, passthrough giữ nguyên câu hỏi) và cho ra dict `{docs, question}`.
`assign(answer=generate)` giữ nguyên dict đó và thêm key `answer` bằng cách chạy nhánh
`generate`. Vì `docs` còn trong dict, `answer_question` trả được cả nguồn mà không retrieve
lần hai. Muốn stream câu trả lời ra UI, thay `.invoke` bằng `.stream` trên nhánh `generate`;
LCEL đã lo phần còn lại.

### cli.py và api/main.py

```python
# src/docs_rag/cli.py
import argparse
import json

from docs_rag.generation.chain import answer_question


def main() -> None:
    parser = argparse.ArgumentParser(prog="docs-rag")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ask").add_argument("question")
    args = parser.parse_args()
    print(json.dumps(answer_question(args.question), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

```python
# src/docs_rag/api/main.py
from fastapi import FastAPI
from pydantic import BaseModel

from docs_rag.generation.chain import answer_question

app = FastAPI(title="docs-rag")


class AskRequest(BaseModel):
    question: str


@app.post("/ask")
def ask(req: AskRequest) -> dict:
    return answer_question(req.question)
```

Cả hai entrypoint chỉ gọi một hàm. Logic RAG không biết nó đang được gọi từ terminal hay
HTTP, nên test chain không cần dựng server.

### Chạy thử

```bash
cp .env.example .env                       # giữ mặc định Ollama
cp -r ~/team-docs/*.md data/raw/
uv run python scripts/ingest.py            # 42 documents -> 388 chunks -> storage/chroma
uv run python -m docs_rag.cli ask "How do we rotate the production API keys?"
uv run uvicorn docs_rag.api.main:app --reload
curl -X POST localhost:8000/ask -H 'content-type: application/json' \
     -d '{"question": "How do we rotate the production API keys?"}'
```

Kết quả dạng:

```json
{
  "answer": "Rotate keys in the admin console, then redeploy the gateway [1][3].",
  "sources": [
    {"n": 1, "source": "runbooks/api-keys.md", "title": "API key rotation"},
    {"n": 2, "source": "onboarding/access.md", "title": "Getting access"},
    {"n": 3, "source": "runbooks/gateway.md", "title": "Gateway deploys"}
  ]
}
```

Nguồn `[2]` được retrieve nhưng model không dùng; đó là tín hiệu bình thường và chính là thứ
bạn sẽ đo ở bước eval (bao nhiêu chunk lấy về thực sự hữu ích).

### Một câu hỏi đi qua các file thế nào

![Luồng một câu hỏi qua cây thư mục docs-rag: scripts/ingest.py chạy offline qua loaders, chunking, embeddings, vectorstore; online thì api/main.py gọi generation/chain.py, chain gọi retrieval/retriever.py và indexing/vectorstore.py, rồi prompts.py và llm.py, trả về answer và sources](blog/langchain-rag-from-scratch-flow.svg)

1. `POST /ask` đến `api/main.py`; Pydantic validate body và gọi `answer_question`.
2. `generation/chain.py` đưa câu hỏi thô vào `RunnableParallel`; nhánh `docs` gọi retriever.
3. `retrieval/retriever.py` hỏi Chroma trong `indexing/vectorstore.py`; Chroma gọi `embed_query` của `indexing/embeddings.py` để biến câu hỏi thành vector.
4. Bốn chunk gần nhất quay về dưới dạng `Document`, mang `source` và `title` từ loader.
5. `format_docs` đánh số `[1]`..`[4]`; `generation/prompts.py` điền `{context}` và `{question}` thành hai message.
6. `generation/llm.py` gửi message đến chat model; `StrOutputParser` lấy text từ `AIMessage`.
7. `chain.py` trả `{answer, sources}`; `main.py` serialize thành JSON.

Mỗi bước là một file, và mỗi file là một component trong bảng ở phần 2. Khi câu trả lời sai,
bạn biết mở file nào: nguồn lấy sai thì nhìn `retrieval/` và `ingestion/chunking.py`; nguồn
đúng mà trả lời sai thì nhìn `generation/prompts.py` và model.

### Test với component giả

`langchain-core` có sẵn model giả để test chain mà không cần Ollama hay API key:
`DeterministicFakeEmbedding` (vector giả nhưng ổn định theo text) và `FakeListChatModel`
(trả lần lượt các câu đã định). Vì `get_llm` và `get_embeddings` là hàm module, test chỉ cần
monkeypatch chúng.

```python
# tests/test_chain.py
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.language_models.fake_chat_models import FakeListChatModel


def test_answer_carries_sources(monkeypatch, tmp_path):
    monkeypatch.setattr("docs_rag.indexing.embeddings.get_embeddings",
        lambda: DeterministicFakeEmbedding(size=64))
    monkeypatch.setattr("docs_rag.generation.llm.get_llm",
        lambda: FakeListChatModel(responses=["Rotate in the console [1]."]))
    # ... ingest 2 file nhỏ vào tmp_path, rồi:
    from docs_rag.generation.chain import answer_question
    out = answer_question("how to rotate keys")
    assert "[1]" in out["answer"] and out["sources"][0]["source"].endswith(".md")
```

Test này chạy dưới một giây và bắt được các lỗi hay gặp nhất: metadata rơi mất trên đường
đi, `format_docs` đánh số lệch, chain trả thiếu key.

### Biến thể agent: cùng retriever, thêm vòng lặp

Khi bạn thực sự cần agentic RAG (câu hỏi đòi tìm nhiều lần), thay đổi nằm ngoài các thư mục
đã có: bọc retriever thành tool và đưa vào `create_agent`. Mọi thứ trong `ingestion`,
`indexing`, `retrieval` dùng lại nguyên vẹn.

```python
# src/docs_rag/agent.py  (tuỳ chọn)
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from docs_rag.config import settings
from docs_rag.retrieval.retriever import format_docs, get_retriever


@tool
def search_docs(query: str) -> str:
    """Search the team's internal docs. Returns numbered passages with sources."""
    return format_docs(get_retriever().invoke(query))


agent = create_agent(
    model=settings.chat_model,          # cần model hỗ trợ tool calling
    tools=[search_docs],
    system_prompt="Answer only from search_docs. Cite [n]. Search again if needed.",
    checkpointer=InMemorySaver(),       # lịch sử theo thread_id
)

question = "Compare key rotation for prod and staging."
result = agent.invoke(
    {"messages": [{"role": "user", "content": question}]},
    {"configurable": {"thread_id": "demo"}},
)
print(result["messages"][-1].content)
```

Model có thể gọi `search_docs` hai lần với hai query khác nhau rồi tổng hợp. Cái giá: số lần
gọi model không còn cố định, và bạn phải đọc trace để biết nó đã tìm gì. Hãy để `agent.py`
nằm cạnh `chain.py` như một lựa chọn, không thay thế.

### Khi nào không nên dùng LangChain

Công bằng mà nói, có những lúc framework là gánh nặng. Nếu hệ thống của bạn chỉ có một model,
một vector store, và một prompt, thì 150 dòng Python gọi thẳng SDK của hãng cũng ngắn ngang
bản LangChain và ít lớp trừu tượng hơn để debug. Chatbot trên chính portfolio này là một ví
dụ: retrieval chạy TF-IDF ngay trong trình duyệt, không có LangChain, vì bài toán không cần.
LangChain trả lại giá trị khi bạn cần đổi mảnh ghép (so sánh model, đổi store), cần
streaming/batch/async miễn phí, cần tracing từng bước, hoặc sắp đi lên agent. Chọn framework
vì bạn có vấn đề nó giải, không phải vì nó phổ biến.

## Tóm lại

LangChain chuẩn hoá interface của model, embedding, vector store, retriever, và cho chúng một
kiểu dữ liệu chung (`Document`, message, `Runnable`) để ghép thành chain. Trong RAG, các mảnh
ghép thành đường thẳng: loader, splitter, embeddings, store lúc index; retriever, prompt,
model, parser lúc hỏi. Trong agent, cùng những mảnh đó nhưng retriever thành tool, chain
thành vòng lặp, và vòng lặp chạy trên LangGraph. Codebase mẫu `docs-rag` đặt mỗi mảnh vào
một file, mỗi giai đoạn vào một thư mục, để người đọc cây thư mục là đọc được pipeline.

Nhưng nói thẳng: cái `docs-rag` vừa build là bản RAG "ngây thơ". Chạy demo thì đẹp, còn gặp
tài liệu thật và người dùng thật thì nó bắt đầu lấy nhầm đoạn, hiểu sai câu hỏi mơ hồ, chậm
dần, tốn tiền hơn dự tính, và không ai đo được nó đang tốt hay tệ. LangChain cho bạn các mảnh
ghép chuẩn, nhưng không cho bạn biết mảnh nào đang hỏng. [Bài 3](#/blog/rag-production-techniques)
bắt đầu từ đúng chỗ đó: đi qua từng giai đoạn của pipeline này, chỉ ra nó hỏng thế nào, kỹ
thuật nào sửa được, và đo bằng gì để biết có cần sửa hay không.
