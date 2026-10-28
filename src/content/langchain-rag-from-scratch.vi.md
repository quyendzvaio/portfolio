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

Ví dụ chuỗi `ollama:llama3.1` trỏ vào model chạy local qua Ollama, `openai:gpt-5.5` trỏ vào
model hosted; đổi chuỗi là đổi hãng, phần còn lại của chương trình không biết gì.

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

Ví dụ, template RAG của dự án bên dưới gồm một message system "Chỉ trả lời từ context sau.
Trích dẫn [n]." nối với chỗ trống `{context}`, và một message human chỉ là chỗ trống
`{question}`. Lúc chạy bạn đưa vào hai giá trị và nhận lại một list message sẵn sàng gửi cho
model.

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

Ví dụ `ollama:nomic-embed-text` cho local, `openai:text-embedding-3-small` cho hosted. Gọi
`embed_query` với một câu hỏi ngắn, bạn nhận về một list vài trăm số (768 với
nomic-embed-text); con số đó là số chiều của vector.

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

Ví dụ, tool tìm tài liệu của dự án bên dưới chỉ là một hàm nhận `query` dạng string, gọi
retriever, và trả về các đoạn đã đánh số kèm nguồn; docstring một dòng của nó là tất cả
những gì model biết về tool.

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

Phần này cố ý không in code. "Base code" ở đây là cấu trúc thư mục cộng với luồng hệ thống:
mỗi file trong cây chỉ gọi đúng một component đã nói ở phần 2, nên khi bạn hiểu file đó nhận
gì và trả gì, bạn tự viết được nó trong vài chục dòng, và quan trọng hơn là bạn biết vì sao
nó nằm ở chỗ đó.

### Cấu trúc thư mục

Nguyên tắc đặt tên: mỗi thư mục là một giai đoạn của pipeline, mỗi file là một component của
LangChain. Ai mới vào dự án chỉ cần đọc cây này là biết dữ liệu đi đường nào.

```text
docs-rag/
├── pyproject.toml            # dependency: langchain, langchain-chroma, -ollama...
├── .env.example              # CHAT_MODEL, EMBEDDING_MODEL dạng "provider:model"
├── data/
│   └── raw/                  # tài liệu nguồn (.md); git-tracked, là đầu vào duy nhất
├── storage/
│   └── chroma/               # index Chroma trên đĩa; gitignored, tạo lại bằng ingest
├── src/docs_rag/
│   ├── config.py             # Settings: tên model, đường dẫn, chunk_size, overlap, top_k
│   ├── ingestion/            # GIAI ĐOẠN 1 (offline): nguồn -> Document -> chunk
│   │   ├── loaders.py        #   Document loader: mỗi file .md -> 1 Document + metadata
│   │   └── chunking.py       #   Text splitter: Document -> chunk, gắn chunk_id ổn định
│   ├── indexing/             # GIAI ĐOẠN 2 (offline): chunk -> vector -> store
│   │   ├── embeddings.py     #   model embedding, dùng chung cho index và query
│   │   └── vectorstore.py    #   Chroma: ghi chunk lúc ingest, tìm chunk lúc hỏi
│   ├── retrieval/            # GIAI ĐOẠN 3 (online): câu hỏi -> top-k chunk đánh số
│   │   └── retriever.py      #   retriever từ vector store + hàm đánh số [n] để citation
│   ├── generation/           # GIAI ĐOẠN 4 (online): chunk + câu hỏi -> câu trả lời
│   │   ├── prompts.py        #   prompt grounded: chỉ dùng context, bắt buộc trích dẫn
│   │   ├── llm.py            #   chat model, temperature 0
│   │   └── chain.py          #   LCEL: retriever | prompt | model | parser, kèm sources
│   ├── api/
│   │   └── main.py           # FastAPI: POST /ask nhận question, trả answer + sources
│   └── cli.py                # CLI: hỏi một câu từ terminal, in answer + sources
├── scripts/
│   └── ingest.py             # chạy offline: load -> split -> embed -> store
├── eval/
│   ├── golden.jsonl          # câu hỏi, đáp án mong đợi, nguồn mong đợi
│   └── run_eval.py           # hit-rate của retriever, kiểm tra citation
└── tests/
    ├── test_chunking.py      # splitter cho ra chunk đúng size, metadata đủ
    └── test_chain.py         # chạy chain với embedding giả + chat model giả
```

Hai thư mục `ingestion` và `indexing` chỉ chạy offline (khi tài liệu đổi). `retrieval` và
`generation` chạy cho mỗi câu hỏi. Tách như vậy để cái chạy mỗi request không bao giờ kéo theo
code đọc file hay cắt chunk, và để khi có lỗi bạn biết mở thư mục nào.

### Từng phần làm gì, và vì sao nằm ở đó

Bảng dưới là "hợp đồng" của từng file: nhận gì, trả gì. Nếu bạn giữ đúng hợp đồng này, bạn
có thể viết lại bất kỳ file nào mà không động vào file khác.

| File | Nhận vào | Trả ra | Component LangChain |
|---|---|---|---|
| `config.py` | biến môi trường | một object Settings bất biến | không (Python thuần) |
| `ingestion/loaders.py` | thư mục `data/raw` | list Document, metadata có source và title | Document loader |
| `ingestion/chunking.py` | list Document | list chunk (cũng là Document), có chunk_id | Text splitter |
| `indexing/embeddings.py` | Settings | model embedding | Embeddings |
| `indexing/vectorstore.py` | Settings + embedding | Chroma đã mở từ `storage/chroma` | Vector store |
| `scripts/ingest.py` | không | index đã ghi, in số document và chunk | ghép 4 file trên |
| `retrieval/retriever.py` | câu hỏi | top-k Document, và bản text đánh số | Retriever |
| `generation/prompts.py` | context + question | list message | Prompt template |
| `generation/llm.py` | Settings | chat model | Chat model |
| `generation/chain.py` | câu hỏi | answer + sources | LCEL |
| `api/main.py`, `cli.py` | request HTTP hoặc tham số dòng lệnh | JSON answer + sources | không |

Vài quyết định thiết kế đáng nói, vì chúng là chỗ người mới hay làm sai.

**config.py giữ mọi tham số, kể cả tên model dạng `"provider:model"`.** Mặc định là
`ollama:llama3.1` cho chat và `ollama:nomic-embed-text` cho embedding, cả hai chạy local.
Đặt biến môi trường `CHAT_MODEL=openai:gpt-5.5` là cả hệ thống chạy trên OpenAI; không file
nào khác biết chuyện đó. Đây chính là lợi ích "ổ cắm chuẩn" ở phần 1, nhìn thấy được. Hai số
quan trọng còn lại: chunk dài 800 ký tự, overlap 120 ký tự (khoảng 15%, để câu bị cắt đôi vẫn
xuất hiện nguyên vẹn ở ít nhất một chunk), và lấy top-k bằng 4.

**loaders.py tự viết, không kéo thêm thư viện.** Với corpus Markdown, một loader kế thừa
`BaseLoader` chỉ cần duyệt thư mục, đọc từng file, lấy dòng heading đầu tiên làm `title`, và
tạo một `Document` với `source` là đường dẫn tương đối. Hai metadata đó sẽ đi theo chunk đến
tận câu trả lời; nghĩ về citation ngay từ đây. Với PDF, thay file này bằng `DoclingLoader`
của `langchain-docling` (giữ được bảng và heading) hoặc `PyPDFLoader` của
`langchain-community` nếu bạn chấp nhận package đang sunset. Phần còn lại không đổi, vì tất
cả chỉ thấy `Document`.

**chunking.py gắn một id ổn định cho mỗi chunk.** Splitter là `RecursiveCharacterTextSplitter`
với `add_start_index` bật, nên mỗi chunk biết vị trí ký tự của nó trong file gốc. Id của chunk
là hash của cặp (source, vị trí bắt đầu). Vì sao quan trọng: nếu ghi vào vector store mà không
có id, mỗi lần chạy ingest là thêm một bộ chunk trùng, và retriever bắt đầu trả về bốn bản của
cùng một đoạn. Với id ổn định, Chroma ghi đè đúng chunk cũ: chạy ingest mười lần vẫn chỉ có
một bộ.

**embeddings.py và vectorstore.py mỗi file tạo đúng một object và giữ nó suốt tiến trình.**
Embedding dùng chung cho cả hai pha (quy tắc "cùng một model" ở phần 2). Chroma mở với
`persist_directory` trỏ vào `storage/chroma`, nên index sống qua các lần khởi động. Tôi chọn
Chroma vì nó lưu ra một thư mục mà không cần server, đủ cho vài chục nghìn chunk, và API qua
LangChain giống hệt mọi store khác. Muốn FAISS hay pgvector, chỉ sửa file này.

**retriever.py làm hai việc.** Một là xin retriever từ vector store với `search_type` là
similarity và k bằng 4. Hai là một hàm nhỏ biến list `Document` thành một khối text, mỗi đoạn
mở đầu bằng số thứ tự trong ngoặc vuông và tên file nguồn. Số đó là hợp đồng giữa prompt và
API: model viết `[2]`, API biết `[2]` là file nào.

**prompts.py chứa prompt grounded.** Đây là text model đọc, không phải code, nên in ra đây:

```text
You answer questions about the team's internal documentation.

Rules:
- Use ONLY the context below. If it does not contain the answer, say
  "I can't find this in the docs" and suggest what to search for instead.
- End every factual sentence with the bracket number of its source, like [1] or [2].
- Keep answers short. Never invent a source number that is not in the context.

Context:
{context}
```

Đó là message system; message human chỉ là `{question}`. Ba quy tắc, mỗi quy tắc chặn một kiểu
lỗi: "only the context" chặn kiến thức ngoài, "say you can't find" chặn bịa cho lịch sự,
"never invent a source number" chặn citation ma. Prompt viết tiếng Anh vì model nhỏ chạy local
tuân thủ chỉ dẫn tiếng Anh tốt hơn; câu hỏi và trả lời vẫn có thể tiếng Việt.

**chain.py ghép tất cả bằng LCEL, và cố ý giữ lại docs.** Chain nhận một string câu hỏi. Bước
một chạy song song hai nhánh: retriever lấy docs, nhánh kia giữ nguyên câu hỏi; kết quả là một
dict có hai key. Bước hai thêm key `answer` vào dict đó bằng nhánh sinh câu trả lời: đánh số
docs, điền prompt, gọi model, lấy text bằng `StrOutputParser`. Vì docs vẫn còn trong dict,
hàm trả lời có thể trả cả `sources` (số thứ tự, file, title) mà không phải retrieve lần hai.
Muốn stream câu trả lời ra UI, gọi `stream` thay vì `invoke` trên nhánh sinh; LCEL lo phần
còn lại.

**cli.py và api/main.py chỉ gọi một hàm.** Logic RAG không biết nó đang được gọi từ terminal
hay HTTP, nên test chain không cần dựng server, và thêm một giao diện mới (Slack bot chẳng hạn)
là thêm một file mỏng, không đụng pipeline.

### Luồng offline: ingest

Bạn chạy script ingest mỗi khi tài liệu đổi. Nó làm năm việc theo thứ tự, mỗi việc là một file
trong cây: loader đọc `data/raw` thành `Document`; splitter cắt thành chunk và gắn id; vector
store nhận list chunk cùng list id, gọi model embedding để biến từng chunk thành vector, rồi
ghi vector, text và metadata vào `storage/chroma`. Cuối cùng nó in một dòng kiểu "42 documents
-> 388 chunks" để bạn biết index có thay đổi bất thường không (số chunk tăng gấp đôi sau một
lần đổi splitter là tín hiệu cần nhìn lại).

### Luồng online: một câu hỏi đi qua các file thế nào

![Luồng một câu hỏi qua cây thư mục docs-rag: scripts/ingest.py chạy offline qua loaders, chunking, embeddings, vectorstore; online thì api/main.py gọi generation/chain.py, chain gọi retrieval/retriever.py và indexing/vectorstore.py, rồi prompts.py và llm.py, trả về answer và sources](blog/langchain-rag-from-scratch-flow.svg)

1. Request `POST /ask` với một câu hỏi đến `api/main.py`; Pydantic validate body và gọi hàm trả lời trong `chain.py`.
2. `generation/chain.py` đưa câu hỏi thô vào bước song song; nhánh docs gọi retriever.
3. `retrieval/retriever.py` hỏi Chroma trong `indexing/vectorstore.py`; Chroma gọi `embed_query` của `indexing/embeddings.py` để biến câu hỏi thành vector, rồi tìm k vector gần nhất.
4. Bốn chunk gần nhất quay về dưới dạng `Document`, mang `source` và `title` từ loader.
5. Hàm đánh số trong `retriever.py` biến chúng thành khối text `[1]`..`[4]`; `generation/prompts.py` điền `{context}` và `{question}` thành hai message.
6. `generation/llm.py` gửi hai message đến chat model; `StrOutputParser` lấy text từ `AIMessage`.
7. `chain.py` trả answer kèm sources; `main.py` serialize thành JSON.

Với câu hỏi "How do we rotate the production API keys?", kết quả trông thế này: answer là
một hai câu, mỗi câu kết thúc bằng `[1]` hoặc `[1][3]`; sources là ba mục, mỗi mục có số thứ
tự, tên file (ví dụ `runbooks/api-keys.md`) và title. Nguồn `[2]` được retrieve nhưng model
không dùng; đó là tín hiệu bình thường và chính là thứ bạn sẽ đo ở bước eval (bao nhiêu chunk
lấy về thực sự hữu ích).

Mỗi bước là một file, và mỗi file là một component trong bảng ở phần 2. Khi câu trả lời sai,
bạn biết mở file nào: nguồn lấy sai thì nhìn `retrieval/` và `ingestion/chunking.py`; nguồn
đúng mà trả lời sai thì nhìn `generation/prompts.py` và model.

### Chạy, test và mở rộng, bằng lời

Để chạy, bạn cần bốn việc: cài các package trong `pyproject.toml` (langchain, langchain-ollama,
langchain-chroma, langchain-text-splitters, fastapi); kéo hai model Ollama là `llama3.1` và
`nomic-embed-text`; chép tài liệu vào `data/raw`; chạy script ingest. Sau đó hỏi qua CLI, hoặc
khởi động FastAPI và gửi `POST /ask` với body có một trường `question`.

Để test mà không cần Ollama hay API key, `langchain-core` có sẵn hai component giả:
`DeterministicFakeEmbedding` (vector giả nhưng ổn định theo text) và `FakeListChatModel` (trả
lần lượt các câu đã định). `test_chain.py` thay hai hàm tạo model trong `embeddings.py` và
`llm.py` bằng chúng, ingest hai file nhỏ vào thư mục tạm, hỏi một câu, và kiểm tra ba điều:
answer có chứa `[1]`, sources có đúng tên file, và metadata không rơi mất trên đường đi. Test
chạy dưới một giây và bắt được các lỗi hay gặp nhất.

Để mở rộng, bạn sửa đúng một file cho mỗi thay đổi: đổi hãng model thì sửa `.env`; đổi vector
store thì sửa `vectorstore.py`; thêm PDF thì sửa `loaders.py`; đổi cách cắt thì sửa
`chunking.py` rồi chạy lại ingest; thêm quy tắc trả lời thì sửa `prompts.py`. Thư mục `eval`
giữ bộ câu hỏi vàng để mỗi lần sửa bạn biết mình làm tốt lên hay tệ đi; [bài 3](#/blog/rag-production-techniques)
nói kỹ cách đo này.

### Biến thể agent: cùng retriever, thêm vòng lặp

Khi bạn thực sự cần agentic RAG (câu hỏi đòi tìm nhiều lần), thay đổi nằm ngoài các thư mục
đã có: thêm một file `agent.py` bọc retriever thành tool và đưa vào `create_agent`. Tool đó,
gọi là `search_docs`, chỉ là một hàm nhận `query` dạng string, gọi retriever, và trả về khối
text đã đánh số; docstring của nó nói với model "tìm trong tài liệu nội bộ, trả về các đoạn
kèm nguồn". `create_agent` nhận tên model từ Settings (phải là model hỗ trợ tool calling),
list tool có một phần tử, một `system_prompt` yêu cầu chỉ trả lời từ kết quả tìm và trích
dẫn `[n]`, và một checkpointer để nhớ lịch sử theo `thread_id`. Mọi thứ trong `ingestion`,
`indexing`, `retrieval` dùng lại nguyên vẹn.

Với câu hỏi "so sánh cách xoay key giữa prod và staging", model có thể gọi `search_docs` hai
lần với hai query khác nhau rồi tổng hợp. Cái giá: số lần gọi model không còn cố định, và bạn
phải đọc trace để biết nó đã tìm gì. Hãy để `agent.py` nằm cạnh `chain.py` như một lựa chọn,
không thay thế.

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
