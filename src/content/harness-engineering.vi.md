---
title: "Harness engineering: Agent = LLM + harness"
date: "2026-10-28"
tags: ["agents", "harness", "llmops"]
summary: "Vì sao một LLM giỏi vẫn làm hỏng việc dài hơi, harness gồm những gì, và cách thiết kế một research agent có harness đầy đủ, nhìn cây thư mục là hiểu."
---

# Harness engineering: Agent = LLM + harness

Bốn bài trước đi từ RAG, LangChain, LangGraph đến MCP. Đến đây bạn đã biết cách cho model
đọc tài liệu, gọi tool, rẽ nhánh theo state và nối tool qua một giao thức chung. Bài cuối này
trả lời câu hỏi còn lại: vì sao một agent được lắp đủ các mảnh đó vẫn hay thất bại khi phải chạy
dài hơi, và cái gì biến "một LLM biết gọi tool" thành "một hệ thống làm xong việc".

## Cùng một model, hai kết quả khác hẳn

Đầu năm 2026, một kỹ sư ở Anthropic chạy cùng một prompt ("làm một trình tạo game 2D kiểu retro")
với cùng một model (Claude Opus 4.5) theo hai cách. Lần một: gọi model trực tiếp, không có gì
hỗ trợ. Hết 20 phút và 9 USD, app mở lên nhưng nhân vật không phản ứng với phím bấm. Lần hai: cùng
model, bọc trong một harness gồm ba vai (planner lập spec, generator làm từng feature, evaluator
bấm thử app như người dùng). Hết 6 giờ và 200 USD, người viết chơi được game, dù vật lý còn thô.
Tác giả nói thẳng: harness đắt hơn 20 lần, nhưng chênh lệch chất lượng thấy ngay. Nguồn:
[Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps).

Model không đổi. Thứ thay đổi là mọi thứ *xung quanh* model. Đó chính là harness.

Bạn sẽ gặp hiện tượng này sớm hơn bạn nghĩ. Giao cho agent một việc 30 phút: nó bắt đầu tốt, đọc
file, viết code, trông rất năng suất. Rồi nó bỏ qua một bước, phá một test, báo "xong" trong khi
chưa chạy được, và phiên sau quên sạch phiên trước. Phản xạ đầu tiên của hầu hết mọi người là
"model chưa đủ thông minh, thử model đắt hơn". Khoá học
[learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) của
walkinglabs mở đầu bằng đúng lời khuyên ngược lại: khi hỏng, soát harness trước, đổi model sau.

## Agent = LLM + harness

Công thức này ngắn đến mức dễ bị coi là khẩu hiệu, nên nói rõ nó từ đâu ra. Thuật ngữ *harness
engineering* được Mitchell Hashimoto dùng trong bài
[My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey) (tháng 2/2026) với
định nghĩa rất thực dụng: mỗi lần agent mắc lỗi, bạn bỏ công kỹ thuật hoá một giải pháp để nó
*không bao giờ* mắc lại lỗi đó, bằng chỉ dẫn trong `AGENTS.md` hoặc bằng tool viết hẳn hoi. Công
thức "Agent = Model + Harness" được Vivek Trivedy viết thành câu trong bài
[The anatomy of an agent harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness)
của LangChain (tháng 3/2026), kèm định nghĩa: harness là *mọi đoạn code, cấu hình và logic thực
thi không phải là model*. Anthropic không dùng công thức đó, nhưng gọi Claude Agent SDK là "một
agent harness đa dụng" trong
[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
và từ cuối 2024 đã mô tả agent trong
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) là
"LLM dùng tool dựa trên phản hồi từ môi trường, trong một vòng lặp". Vòng lặp và môi trường ấy
chính là harness, chỉ chưa có tên.

Vậy harness là gì, nói bằng lời thường? Nếu model là *bộ não* thì harness là toàn bộ phần còn lại
để bộ não đó làm được việc: vòng lặp gọi model rồi chạy tool, bộ tool và mô tả của chúng, cách
quản lý context (những gì model được nhìn thấy ở mỗi bước), bộ nhớ và state ngoài context,
môi trường chạy (sandbox, giới hạn), quyền và guardrail (được làm gì, không được làm gì), kiểm
chứng và phản hồi (sao biết là đúng), quan sát (trace, log, eval) và phục hồi (lỗi rồi làm gì tiếp).

Một ví dụ quen thuộc: bạn tuyển được một kỹ sư rất giỏi. Ngày đầu, bạn ném cho họ một câu "làm
tính năng tìm kiếm nhé" rồi đi họp. Không README, không biết chạy test bằng lệnh gì, không ai nói
convention của team, không ai review. Người đó vẫn giỏi, nhưng sẽ đoán sai yêu cầu, dùng nhầm
thư viện, và tự tin báo xong vì không có gì để tự kiểm. Cũng người đó, với một bản brief rõ, một
máy đã cài sẵn môi trường, một checklist "xong là thế nào", quyền truy cập vừa đủ, và một người
review độc lập, sẽ làm ra sản phẩm dùng được. Khoá học dùng đúng hình ảnh này ở
[bài 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md),
và thêm một điểm quan trọng: agent còn khó hơn người mới, vì người mới ít nhất còn hỏi được đồng
nghiệp. Agent chỉ thấy đúng những file bạn đưa và những lệnh bạn cho chạy.

![Sơ đồ Agent = LLM + harness: model ở giữa, chín thành phần harness bao quanh, vòng lặp gọi model và chạy tool nối chúng lại](blog/harness-engineering-agent-anatomy.svg)

Harness mang lại gì cho agent? Năm thứ, và chúng đối ứng với năm kiểu thất bại điển hình:

- **Bền trên việc dài.** Việc thật kéo qua nhiều context window và nhiều phiên; không có state ngoài context thì mỗi phiên bắt đầu từ số không.
- **Đi đúng hướng.** Agent hay làm quá nhiều việc cùng lúc hoặc tự đổi mục tiêu; harness giữ phạm vi và định nghĩa "xong".
- **Không lặp lại lỗi.** Mỗi lỗi được chuyển thành một quy tắc hoặc một bước kiểm tra tự động, đúng tinh thần Hashimoto.
- **An toàn.** Quyền, sandbox, giới hạn chi tiêu: agent chỉ làm được những gì bạn cho phép.
- **Đo được.** Trace và eval biến "cảm giác nó ổn" thành số liệu, để bạn biết thay đổi nào thực sự có ích.

Một câu đáng nhớ từ bài của Anthropic về harness: *mỗi thành phần trong harness mã hoá một giả
định về điều model chưa tự làm được*. Khi model mạnh lên, vài thành phần trở nên thừa (tác giả bỏ
được context reset khi chuyển lên Opus 4.5, bỏ sprint khi lên Opus 4.6), nhưng không gian harness
không co lại mà *dịch chuyển*. Harness vì thế không phải thứ viết một lần; nó là code, và nó cũng
mục như code.

## Các thành phần của một harness

Khoá học learn-harness-engineering (14 bài giảng, 8 project, tất cả xoay quanh coding agent) đưa
ra một khung năm hệ con. Thú vị là khoá học dùng hai cách gọi. README chia theo *việc harness
phải làm*: Instructions, State, Verification, Scope, Session lifecycle. Bài 02 chia theo *lớp kỹ
thuật*: Instructions, Tools, Environment, State, Feedback. Hai cách bổ nhau, nên dưới đây tôi gộp
lại thành tám thành phần, mỗi thành phần trả lời ba câu: nó chứa gì, nó chặn lỗi nào, ví dụ cụ
thể là gì. Phần "context" được tách riêng vì khi phân tích Claude Code, khoá học coi nó là một hệ
con độc lập, và vì nó là chỗ agent nghiên cứu dài hơi hay chết nhất.

| Thành phần | Chứa gì | Chặn lỗi nào |
|---|---|---|
| Instructions | system prompt, AGENTS.md, định nghĩa xong | đoán sai yêu cầu, phạm convention ngầm |
| Tools | tool + mô tả, schema, MCP server | không làm được việc, hoặc làm sai cách |
| Environment | sandbox, phiên bản, allow-list | đốt context vào lỗi môi trường |
| Context | compaction, ghi chú, sub-agent | context rot, quên giữa chừng |
| State | progress file, feature list, git | phiên sau làm lại từ đầu |
| Scope | một việc một lúc, WIP=1 | làm nhiều, xong chẳng cái nào |
| Verification | test, checker, evaluator độc lập | tự tin báo xong khi chưa xong |
| Observability | trace, rubric, eval | không sửa được cái không nhìn thấy |

### Instructions: bản đồ, không phải bách khoa

Chứa: system prompt, file chỉ dẫn ở gốc repo (`AGENTS.md` hay `CLAUDE.md`), và một *định nghĩa
xong* kiểm được bằng lệnh. Chặn: hai lỗi hàng đầu trong bài 01 của khoá học là yêu cầu mơ hồ (agent
chỉ còn cách đoán) và convention không được viết ra (agent không thể tuân cái nó chưa từng thấy).
Ví dụ: thay "thêm tìm kiếm" bằng "endpoint `GET /api/search?q=`, phân trang 20, pass `pytest` và
`mypy --strict`". Khoá học nhấn mạnh ở bài 04: một file khổng lồ phản tác dụng; giữ `AGENTS.md`
khoảng 100 dòng như một trang mục lục, chi tiết để trong `docs/` cho agent đọc khi cần. Bài
[context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
của Anthropic gọi đây là "độ cao đúng" của prompt: đủ cụ thể để dẫn hướng, đủ linh hoạt để model
tự xử lý tình huống, không hardcode logic giòn.

### Tools: hợp đồng giữa hệ xác định và agent bất định

Chứa: các tool, mô tả, schema tham số, và cách chúng được bày ra (có thể qua MCP, như bài 5).
Chặn: agent không có cách làm việc, hoặc có quá nhiều tool chồng lấn nên chọn sai. Bài
[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
của Anthropic định nghĩa tool là "hợp đồng giữa hệ xác định và agent bất định", và rút ra vài quy
tắc: ít tool nhưng trúng workflow thay vì bọc từng endpoint; `search_contacts` tốt hơn
`list_contacts` vì context có hạn; trả về thông tin giàu tín hiệu (bỏ UUID, bỏ mime type); có
tham số `response_format` để model chọn bản gọn hay bản đầy đủ; thông điệp lỗi phải nói *sửa thế
nào*, không chỉ "sai". Khoá học bổ sung nguyên tắc tối thiểu đặc quyền: không tắt shell "cho an
toàn" khiến agent không cài được gì, nhưng cũng không mở hết.

### Environment: môi trường tự mô tả

Chứa: nơi agent chạy, phiên bản runtime, dependency bị khoá, dữ liệu mẫu, và giới hạn (mạng, thời
gian, bộ nhớ). Chặn: agent đốt context window vào `pip install` lỗi và xung đột phiên bản thay vì
làm việc chính. Ví dụ từ bài 06: tách *initialization* thành pha riêng với `init.sh` (cài, kiểm
tra, khởi động) và một checklist "sẵn sàng" gồm bốn điều: chạy được, test được, thấy tiến độ, biết
bước tiếp. Với agent nghiên cứu, environment còn là allow-list domain được fetch và giới hạn kích
cỡ trang, để một trang web độc không biến thành prompt injection chiếm quyền agent.

### Context: tài nguyên hữu hạn, lợi suất giảm dần

Chứa: chính sách về *cái gì nằm trong context window ở mỗi bước*. Chặn: *context rot*, hiện tượng
model nhớ kém dần khi context dài ra, và chuyện agent "hết hơi" giữa việc. Anthropic coi context là
ngân sách chú ý hữu hạn; mục tiêu là *tập token nhỏ nhất mà tín hiệu cao nhất*. Ba kỹ thuật cho
việc dài: **compaction** (tóm tắt lịch sử, giữ quyết định kiến trúc, bug chưa xong, chi tiết
triển khai; bỏ output tool thừa; cách nhẹ và an toàn nhất là xoá kết quả tool cũ), **ghi chú có
cấu trúc** (agent tự viết `NOTES.md` ngoài context rồi đọc lại), và **sub-agent** (mỗi việc con
chạy trong context sạch, trả về bản tóm tắt 1-2 nghìn token). Khi mổ xẻ Claude Code, khoá học
cho thấy nó dùng một pipeline nén nhiều tầng: cắt không mất mát trước, chưng cất có cấu trúc sau,
tóm tắt bằng LLM cuối cùng, có cầu chì chống nén quá tay.

### State: bộ nhớ sống ngoài context

Chứa: file tiến độ, danh sách việc có trạng thái, lịch sử git, tài liệu bàn giao. Chặn: mất liên
tục giữa các phiên, làm lại việc đã xong, hoặc "nhìn quanh thấy có tiến độ rồi tuyên bố xong việc
cả dự án" (một thất bại Anthropic ghi lại nguyên văn). Ví dụ từ Anthropic: một `init.sh`, một
`claude-progress.txt` ghi những gì đã làm, một `feature_list.json` hơn 200 feature khởi đầu đều
`failing`, agent chỉ được lật trường `passes`, và cấm xoá hay sửa test. Họ chọn JSON thay Markdown
vì model ít tự ý sửa JSON hơn. Khoá học (bài 08) gọi mỗi mục trong danh sách là một bộ ba
*(mô tả hành vi, lệnh kiểm chứng, trạng thái)*, và quy định trạng thái chỉ đổi sang `passing` khi
lệnh kiểm chứng chạy qua, do harness thực hiện, không phải do agent tự ghi.

### Scope: một việc một lúc

Chứa: giới hạn số việc đang mở (WIP, work in progress) và ranh giới của mỗi việc, ghi thành file.
Chặn: cặp lỗi song sinh bài 07 gọi là *overreach* (làm quá) và *under-finish* (dang dở). Ví dụ:
Anthropic yêu cầu coding agent chỉ làm một feature mỗi phiên và thấy đây là điểm mấu chốt chống xu
hướng "làm một phát hết cả app". Khoá học đo được: cùng tám feature, chế độ tự do để lại ba cái
làm dở; chế độ WIP=1 sau bốn phiên xong bảy. Dòng code và tỉ lệ hoàn thành tỉ lệ nghịch.

### Verification: tự tin không phải là đúng

Chứa: lệnh kiểm chứng, checker tự động, và một evaluator *tách khỏi* người làm. Chặn: lỗi phổ
biến nhất, *tuyên bố thắng sớm*. Bài 09 gọi đây là verification gap, khoảng cách giữa độ tự tin
của agent và độ đúng thật, và đề xuất ba lớp: cú pháp qua, hành vi qua (test chạy, app khởi động),
hệ thống qua (end-to-end). Anthropic rút ra bài học tương tự theo cách đau hơn: unit test và `curl`
đều qua nhưng app vỡ khi dùng thật; chỉ khi bắt agent dùng browser automation "test như người dùng"
kết quả mới cải thiện rõ. Và vì generator có xu hướng tự khen, họ tách evaluator riêng, kèm ngưỡng
cứng cho từng tiêu chí. Bài 13 của khoá học nâng điều này thành nguyên tắc: *maker và checker phải
tách nhau*, đôi khi là hai model khác nhau.

### Observability: không thấy thì không sửa

Chứa: trace từng bước (gọi tool gì, với input nào, tốn bao nhiêu token), log runtime, rubric chấm,
và bộ eval. Chặn: retry mù, đánh giá cảm tính, và bàn giao mất thông tin. Bài 11 chia hai lớp:
*runtime observability* trả lời "hệ thống đã làm gì" và *process observability* trả lời "vì sao
thay đổi này nên được chấp nhận" (sprint contract, rubric). Bài
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
cho vốn từ: *task* (một ca kiểm thử), *trial* (một lần chạy), *grader* (logic chấm), *transcript*
(toàn bộ diễn biến), *outcome* (trạng thái cuối của môi trường, không phải lời agent nói). Lời
khuyên đáng giá nhất: chấm *kết quả*, không chấm *đường đi*; dùng grader bằng code khi có thể,
LLM khi cần, người khi thật quan trọng; và không tin số liệu cho đến khi đã đọc transcript. Cũng
không cần đợi: 20 đến 50 task lấy từ lỗi thật là một khởi đầu tốt.

Cuối cùng là cách *chọn* thành phần: giữ model cố định, bỏ từng thành phần một, xem cái nào gây tụt
nhiều nhất. Khoá học kể một team dùng cùng GPT-4o cho dự án React 20 nghìn dòng: chỉ README, 1 trong
5 lần chạy thành công; thêm `AGENTS.md`, 60%; thêm lệnh kiểm chứng, 80%; thêm file tiến độ, ổn
định 80 đến 100%. Bốn vòng, không đổi model. Nhưng ablation chỉ nói "cái nào đang có giá nhất",
không nói "nút thắt ở đâu"; muốn biết điều đó bạn phải đọc log lỗi và quy từng lỗi về một lớp.

## Case thực tế: research agent có harness đầy đủ

Chuyển sang một hệ thống cụ thể. Tôi chọn research agent vì nó đủ dài để lộ mọi điểm yếu: nhận một
câu hỏi, lập kế hoạch, tìm nguồn, đọc, ghi chú, rồi tổng hợp thành báo cáo có trích dẫn, qua vài
chục bước. Không có harness, agent kiểu này bịa URL, trích dẫn trang chưa từng mở, đọc 40 trang
rồi quên 30 trang đầu, và dừng khi "cảm thấy đủ".

Câu hỏi mẫu xuyên suốt phần này: *"Có bằng chứng đo lường nào cho thấy đổi harness, không đổi
model, làm thay đổi kết quả của agent?"*

### Luồng hệ thống

![Luồng của research agent: câu hỏi vào, lập kế hoạch, vòng lặp tìm, đọc, ghi chú đi qua cổng quyền, tổng hợp, kiểm chứng trích dẫn, và các thành phần harness bên dưới vòng lặp](blog/harness-engineering-research-flow.svg)

Đọc sơ đồ theo hàng trên: câu hỏi vào, model lập kế hoạch (những câu hỏi con nào, nguồn nào đáng
tin), rồi đi vào vòng lặp *tìm, đọc, ghi chú* cho đến khi đủ, tổng hợp bản nháp, và nộp cho bộ kiểm
chứng. Kiểm chứng không qua thì bản nháp quay lại tổng hợp (hoặc quay lại tìm thêm nguồn); qua thì
ra báo cáo. Hàng dưới là harness: mọi lời gọi tool đều đi qua cổng quyền; context được nén khi vượt
ngưỡng; tiến độ và ghi chú ghi xuống đĩa sau mỗi bước; từng bước được trace; ngân sách và điều kiện
dừng bọc toàn bộ vòng lặp. Model quyết định *làm gì tiếp*; harness quyết định *được làm trong khuôn
nào*, và *khi nào được gọi là xong*.

### Cây thư mục: nhìn là thấy đâu là agent, đâu là harness

Mã dưới đây dùng Anthropic Python SDK 2.x (gọi thẳng Messages API, tự viết vòng lặp để mọi thành
phần harness lộ ra) và MCP Python SDK 2.x cho phần tool. Nếu bạn dùng LangGraph như bài 4, mỗi ô
trong sơ đồ thành một node và state của graph thay cho `progress.json`; các thành phần harness vẫn
y nguyên, chỉ đổi chỗ đứng.

```text
research-agent/
├── AGENTS.md                 # bản đồ cho agent: mục tiêu, quy tắc trích dẫn, lệnh kiểm
├── config.yaml               # model, ngân sách, ngưỡng nén, allow-list domain
├── run.py                    # điểm vào: python run.py "câu hỏi" [--resume RUN_ID]
├── agent/                    # phần "bộ não" dùng: vòng lặp và prompt
│   ├── loop.py               # gọi model -> chạy tool -> ghi state, có điều kiện dừng
│   ├── prompts/
│   │   ├── system.md         # vai, quy trình plan-search-read-note-synthesize, format
│   │   └── compaction.md     # prompt tóm tắt lịch sử: giữ gì, bỏ gì
│   └── report_schema.py      # cấu trúc báo cáo: đoạn + [n] + danh sách nguồn
├── tools/                    # những gì agent có thể làm (bọc MCP được)
│   ├── registry.py           # ToolSpec: tên, mô tả, schema, hàm, cờ read_only/network
│   ├── search.py             # tìm web: lọc domain, trả title+url+snippet gọn
│   ├── fetch.py              # tải trang -> text sạch, cắt theo giới hạn, lưu bản gốc
│   ├── notes.py              # ghi chú có cấu trúc: claim, quote, url
│   ├── submit_report.py      # nộp báo cáo: chạy verifier, trả lỗi để model sửa
│   └── mcp_server.py         # bày các tool trên qua MCP cho agent khác dùng lại
├── harness/                  # những gì quản vòng lặp, không phụ thuộc model
│   ├── context.py            # nén context: xoá tool_result cũ, rồi tóm tắt nếu vẫn dài
│   ├── state.py              # progress.json + notes.md: load, save, resume, handoff
│   ├── policy.py             # cổng quyền: tool nào, domain nào, bao nhiêu lần
│   ├── sandbox.py            # giới hạn mạng/thời gian/kích cỡ cho fetch
│   ├── budget.py             # đếm token, số bước, tiền; quyết định dừng
│   ├── tracing.py            # trace.jsonl: mỗi bước, mỗi tool call, usage, verdict
│   └── verifiers/
│       ├── citations.py      # mọi claim có [n]; mọi [n] trỏ tới URL đã fetch
│       └── structure.py      # đủ mục, đủ số nguồn tối thiểu, không đoạn trống
├── evals/
│   ├── tasks.jsonl           # 30 câu hỏi từ lỗi thật + tiêu chí chấm
│   ├── graders.py            # grader bằng code (domain phải có, claim phải có nguồn)
│   └── run_evals.py          # chạy k lần, báo pass@k và pass^k, lưu transcript
└── runs/
    └── 2026-10-28_harness-evidence/
        ├── progress.json     # bước hiện tại, plan, URL đã mở, trạng thái
        ├── notes.md          # ghi chú agent tự viết, đọc lại sau khi nén
        ├── sources/          # bản gốc từng trang, để verifier đối chiếu quote
        ├── trace.jsonl       # trace của lần chạy
        └── report.md         # báo cáo cuối, chỉ tồn tại khi verifier đã qua
```

Hai thư mục `agent/` và `tools/` là phần người đọc quen thấy trong mọi demo. Thư mục `harness/`
là phần làm nên khác biệt giữa demo và hệ thống, và nó không import gì từ model: thay model, đổi
framework, `harness/` vẫn dùng được. `evals/` và `runs/` là bằng chứng: không có chúng, bạn chỉ có
cảm giác.

### Đi một câu hỏi qua hệ thống

Chạy `python run.py "Có bằng chứng đo lường nào cho thấy đổi harness, không đổi model, làm thay đổi
kết quả của agent?"`. `state.py` tạo thư mục run, `progress.json` với `step: 0`, và tracer mở
`trace.jsonl`. Bước 0, model nhận system prompt (từ `system.md`, kèm trạng thái rút gọn từ
`progress.json`) và lập kế hoạch: ba câu hỏi con (thí nghiệm có đối chứng cùng model, benchmark
trước/sau khi đổi harness, nghiên cứu ablation) và các loại nguồn ưu tiên (blog kỹ thuật của
vendor, repo, paper). Kế hoạch ghi vào `progress.json`; từ giờ nó là thứ model đọc lại sau mỗi
lần nén context.

Bước 1 đến 4, model gọi `search` với từng câu hỏi con. Mỗi lời gọi đi qua `policy.py`: `search`
là read-only và được phép, nhưng kết quả bị lọc theo allow-list domain trong `config.yaml`. Tool
trả về tối đa tám kết quả, mỗi kết quả chỉ có tiêu đề, URL, một đoạn trích; không HTML, không
metadata thừa. Model chọn ba URL để đọc và gọi `fetch`. `sandbox.py` giới hạn 200 KB và 15 giây
mỗi trang, lưu bản gốc vào `sources/`, trả về text sạch đã cắt, kèm một dòng "đã cắt ở 60%, dùng
`offset` để đọc tiếp" nếu trang dài. Đọc xong một trang, model gọi `write_note` với ba trường:
claim (một câu), quote (nguyên văn, ngắn), url. `notes.py` ghi vào `notes.md` và đánh dấu URL đó
là đã đọc trong `progress.json`.

Bước 12, `budget.py` báo context ước tính đã vượt ngưỡng 120 nghìn token. `context.py` làm hai
việc theo thứ tự: trước hết xoá nội dung các `tool_result` cũ (giữ sáu kết quả gần nhất), vì đó là
cách nén nhẹ tay và an toàn nhất; đo lại, nếu vẫn dài thì gọi model với `compaction.md` để tóm tắt
phần lịch sử cũ thành một đoạn, giữ đúng những gì prompt yêu cầu: kế hoạch, câu hỏi con đã đóng,
nguồn đã đọc và chưa đọc, nghi vấn chưa giải quyết. Lịch sử mới gồm bản tóm tắt cộng vài lượt gần
nhất. Agent không hoảng vì mất chi tiết: chi tiết nằm trong `notes.md`, nó có thể gọi `read_notes`.

Bước 20, model thấy ba câu hỏi con đều có ít nhất hai nguồn và viết bản nháp, rồi gọi
`submit_report`. Đây là chỗ harness tỏ rõ ý đồ: nộp báo cáo *là một tool*, và tool đó chạy
`verifiers/`. `citations.py` thấy đoạn ba có một con số không kèm `[n]`, và `[4]` trỏ tới một URL
có trong kết quả search nhưng chưa từng được `fetch`. Tool trả về `is_error: true` với hai dòng
lỗi nói đích danh đoạn nào, URL nào, và cách sửa ("fetch URL rồi ghi chú, hoặc bỏ claim"). Model
fetch trang đó, ghi chú, sửa bản nháp, nộp lại ở bước 23. Verifier qua, `report.md` được ghi,
`progress.json` chuyển `done: true`, vòng lặp dừng.

Nếu ở bước 23 ngân sách 40 bước hoặc 400 nghìn token cạn trước, `loop.py` không cố nộp một báo cáo
chưa kiểm; nó ghi một mục bàn giao vào `progress.json` (đang ở đâu, thiếu gì, bước tiếp là gì) và
thoát với mã lỗi. Lần sau chạy `--resume` sẽ đọc tiến độ, ghi chú và danh sách nguồn, bắt đầu từ
bước 23 chứ không phải bước 0. Suốt quá trình, `trace.jsonl` có một dòng cho mỗi bước và mỗi tool
call; `run_evals.py` chạy lại câu hỏi này cùng 29 câu khác ba lần mỗi câu và báo pass^3, con số
cho biết hệ thống *ổn định* đến đâu chứ không chỉ "có lúc đúng".

### Mã khung của bốn mảnh quan trọng

**Vòng lặp.** Mọi quyết định của harness nằm ở các dòng không gọi model: cổng quyền trước tool,
nén trước khi gọi, ghi state sau mỗi bước, và điều kiện dừng không thuộc quyền model.

```python
# agent/loop.py  (Anthropic Python SDK 2.x)
import anthropic
from harness import budget, context, policy, state, tracing
from tools.registry import REGISTRY

def run(question: str, cfg: dict, run_id: str) -> state.Progress:
    client = anthropic.Anthropic()
    prog = state.load_or_create(run_id, question)      # progress.json + notes.md
    messages = state.load_messages(run_id) or [
        {"role": "user", "content": question}]
    tracer = tracing.Tracer(run_id)

    while not prog.done:
        # Điều kiện dừng thuộc harness, không thuộc model.
        if budget.exhausted(prog, cfg):
            state.write_handoff(prog, reason="budget")
            break
        # Nén context trước khi gọi model, chỉ khi vượt ngưỡng.
        messages = context.maybe_compact(client, messages, prog, cfg)

        resp = client.messages.create(
            model=cfg["model"],
            max_tokens=16000,
            system=state.render_system(prog),          # system.md + state rút gọn
            tools=REGISTRY.schemas(),
            messages=messages,
        )
        tracer.model_call(prog.step, resp.usage, resp.stop_reason)
        budget.record(prog, resp.usage)

        if resp.stop_reason == "end_turn":
            # Model dừng mà chưa submit_report: nhắc lại, không chấp nhận văn bản trần.
            messages.append({"role": "assistant", "content": resp.content})
            messages.append({"role": "user", "content":
                "Chưa có báo cáo nào được nộp qua submit_report. Tiếp tục."})
            prog.step += 1
            continue
        if resp.stop_reason == "pause_turn":           # server-tool tạm dừng, gửi lại
            messages.append({"role": "assistant", "content": resp.content})
            continue

        messages.append({"role": "assistant", "content": resp.content})
        results = []
        for call in (b for b in resp.content if b.type == "tool_use"):
            verdict = policy.check(call.name, call.input, prog, cfg)
            if not verdict.allowed:                    # cổng quyền: từ chối có lý do
                out = f"Bị từ chối: {verdict.reason}"
                is_error = True
            else:
                out, is_error = REGISTRY.run(call.name, call.input, prog)
            tracer.tool_call(prog.step, call.name, call.input, is_error)
            results.append({"type": "tool_result", "tool_use_id": call.id,
                            "content": out, "is_error": is_error})
        messages.append({"role": "user", "content": results})

        prog.step += 1
        state.save(prog, messages)                     # phiên sau resume từ đây
    return prog
```

Hai chi tiết đáng chú ý. Thứ nhất, `end_turn` không phải "xong": xong chỉ có một đường là
`submit_report` chạy qua verifier và lật `prog.done`. Đây là *pass-state gating* của khoá học áp
vào báo cáo thay vì feature. Thứ hai, tool bị từ chối vẫn trả `tool_result` với `is_error`, để model
biết vì sao và đổi hướng, thay vì lặng lẽ bị bỏ qua.

**Một tool.** Mô tả tool là một prompt. Nó nói cho model khi nào dùng, tham số nghĩa là gì, và kết
quả trông thế nào. Phần thân tool lo chuyện tiết kiệm context.

```python
# tools/search.py
from tools.registry import ToolSpec

def search(query: str, max_results: int = 8, *, prog, cfg) -> tuple[str, bool]:
    allowed = cfg["permissions"]["allowed_domains"]
    hits = [h for h in cfg["search_backend"](query, max_results * 2)
            if any(h.domain.endswith(d) for d in allowed)][:max_results]
    if not hits:
        return ("Không có kết quả trong các domain được phép. "
                "Thử từ khoá khác hoặc cụ thể hơn.", True)
    # Chỉ trả tín hiệu cao: tiêu đề, URL, một đoạn trích. Không HTML, không id.
    lines = [f"- {h.title}\n  {h.url}\n  {h.snippet[:200]}" for h in hits]
    prog.seen_urls.update(h.url for h in hits)        # verifier dùng để đối chiếu
    return "\n".join(lines), False

SEARCH = ToolSpec(
    name="search",
    description=(
        "Tìm trên web trong các domain nguồn được phép (blog kỹ thuật của vendor, "
        "repo, paper). Dùng khi cần tìm NGUỒN cho một câu hỏi con; mỗi lần một ý. "
        "Kết quả chỉ là ứng viên: phải fetch trước khi trích dẫn."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string",
                      "description": "Câu truy vấn ngắn, 3-8 từ khoá, tiếng Anh"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 10,
                            "description": "Mặc định 8; tăng khi recall thấp"},
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    fn=search,
    read_only=True,
    network=True,
)
```

`ToolSpec` giữ hai cờ `read_only` và `network` để `policy.py` quyết định mà không cần biết từng
tool; đó cũng là ý tưởng *annotation* của MCP mà bài 5 đã nhắc. Nếu muốn một agent khác dùng lại
bộ tool này, `tools/mcp_server.py` chỉ cần bọc chúng:

```python
# tools/mcp_server.py  (MCP Python SDK 2.x)
from mcp.server import MCPServer
from tools import search as s

mcp = MCPServer("research-tools")

@mcp.tool()
def search(query: str, max_results: int = 8) -> str:
    """Tìm nguồn trong các domain được phép. Trả title, url, snippet."""
    text, _ = s.search(query, max_results, prog=..., cfg=...)
    return text
```

**Một verifier.** Verifier là code thuần, không gọi model, nên nó không "tự thuyết phục" rằng lỗi
không quan trọng, điều Anthropic quan sát được ở evaluator bằng LLM khi chưa được tinh chỉnh. Lỗi
trả về phải nói cách sửa.

```python
# harness/verifiers/citations.py
import re
CITE = re.compile(r"\[(\d+)\]")

def check_citations(report: str, prog) -> list[str]:
    """Trả về danh sách lỗi; rỗng nghĩa là qua."""
    body, _, sources = report.partition("\n## Sources\n")
    src = dict(re.findall(r"^\[(\d+)\]\s+(\S+)", sources, flags=re.M))
    errors = []

    for i, para in enumerate(p for p in body.split("\n\n") if p.strip()):
        if para.startswith("#"):
            continue
        has_number = re.search(r"\d", para) is not None
        if has_number and not CITE.search(para):
            errors.append(
                f"Đoạn {i + 1} nêu số liệu nhưng không có [n]. "
                "Thêm trích dẫn tới một nguồn đã fetch, hoặc bỏ số liệu.")

    for n in set(CITE.findall(body)):
        url = src.get(n)
        if url is None:
            errors.append(f"[{n}] được dùng nhưng không có trong ## Sources.")
        elif url not in prog.fetched_urls:
            errors.append(
                f"[{n}] trỏ tới {url} nhưng URL này chưa được fetch. "
                "Gọi fetch rồi write_note trước khi trích dẫn.")
    return errors
```

Điểm mấu chốt là `prog.fetched_urls`: đó là sự thật do harness ghi khi `fetch` chạy, không phải do
model khai. Một URL chỉ xuất hiện trong kết quả search (`seen_urls`) chưa đủ để được trích dẫn.
Đây là cách chặn lỗi "bịa nguồn" bằng cấu trúc, không bằng lời dặn trong prompt.

**Bước nén context.** Hai tầng, từ nhẹ đến nặng, và luôn ưu tiên tầng nhẹ.

```python
# harness/context.py
from harness import budget

def maybe_compact(client, messages, prog, cfg):
    trig = cfg["compaction"]["trigger_tokens"]
    if budget.estimate_tokens(messages) < trig:
        return messages

    # Tầng 1: xoá nội dung tool_result cũ, giữ N kết quả gần nhất. Không mất quyết định.
    keep = cfg["compaction"]["keep_recent_tool_results"]
    seen = 0
    for msg in reversed(messages):
        if msg["role"] != "user" or not isinstance(msg["content"], list):
            continue
        for block in msg["content"]:
            if block.get("type") == "tool_result":
                seen += 1
                if seen > keep:
                    block["content"] = "[đã xoá khi nén; chi tiết trong notes.md]"
    if budget.estimate_tokens(messages) < trig:
        return messages

    # Tầng 2: tóm tắt phần cũ bằng model, theo prompt compaction.md.
    old, recent = messages[:-6], messages[-6:]
    summary = client.messages.create(
        model=cfg["model"], max_tokens=4000,
        system=open("agent/prompts/compaction.md").read(),
        messages=old + [{"role": "user", "content":
            "Tóm tắt lịch sử trên để một phiên mới tiếp tục được việc."}],
    )
    text = next(b.text for b in summary.content if b.type == "text")
    prog.compactions += 1
    return [{"role": "user", "content":
             f"[Tóm tắt lịch sử sau {prog.compactions} lần nén]\n{text}"}] + recent
```

`compaction.md` nói rõ giữ gì: kế hoạch và tình trạng từng câu hỏi con, URL đã đọc và chưa đọc,
nghi vấn còn mở, quyết định đã chốt; bỏ gì: nội dung trang đã ghi chú, các lần tìm không ra. Nếu
dùng Claude API, bạn có thể thay tầng 1 bằng tính năng context editing và tầng 2 bằng compaction
phía server (cả hai đang ở trạng thái beta); hiểu được phiên bản tự viết thì bạn biết mình đang
bật cái gì. Lưu ý thêm: với các model mới nhất, sửa lịch sử đã gửi có thể làm mất hiệu lực các
block suy luận trước đó, nên hãy kiểm tra tài liệu model trước khi tự nén theo cách ghi đè.

**Cấu hình và bằng chứng.** `config.yaml` là nơi mọi "giả định về điều model chưa làm được" nằm
thành số, để bỏ bớt khi model mạnh lên:

```yaml
model: claude-opus-5-5
limits:
  max_steps: 40
  token_budget: 400000
compaction:
  trigger_tokens: 120000
  keep_recent_tool_results: 6
permissions:
  allowed_domains: [anthropic.com, langchain.com, github.com, arxiv.org]
  fetch_max_bytes: 200000
  fetch_timeout_s: 15
verifiers:
  min_sources: 3
  require_citation_for_numbers: true
```

Và `evals/tasks.jsonl`, mỗi dòng một task với tiêu chí chấm bằng code (in dãn dòng ở đây
cho dễ đọc; trong file mỗi task nằm trên một dòng):

```json
{
  "id": "harness-evidence",
  "question": "Evidence that changing the harness, not the model, changes agent results?",
  "must_cite_domains": ["anthropic.com"],
  "min_sources": 3,
  "forbidden": ["uncited_number"]
}
```

`run_evals.py` chạy mỗi task k lần, chấm *outcome* (file `report.md` có qua grader không) chứ không
chấm đường đi, và báo cả pass@k lẫn pass^k. Với agent nghiên cứu mà người dùng tin kết quả, pass^k
là con số đáng nhìn: 75% mỗi lần nghe ổn, nhưng xác suất ba lần liền đều ổn chỉ khoảng 42%.

## Khi nào không cần harness đầy đủ

Mỗi thành phần ở trên có giá: code phải bảo trì, token để tóm tắt, tiền cho evaluator, và thời
gian chạy. Harness đầy đủ của Anthropic đắt gấp 20 lần lời gọi trần. Vì vậy:

- Một câu hỏi trả lời được trong một lần tìm và một lần gọi model thì không cần agent, càng không cần harness; RAG của bài 1 là đủ.
- Việc có đường đi cố định (tìm, tóm tắt, dịch) nên là workflow có code điều khiển, như Anthropic phân biệt với agent; verifier và trace vẫn hữu ích, nhưng bỏ vòng lặp mở.
- Bắt đầu bằng ba thứ rẻ nhất mà lợi nhất: định nghĩa xong kiểm được bằng lệnh, một verifier bằng code, và một file tiến độ. Khoá học và Anthropic đều xếp phản hồi kiểm chứng là thành phần có ROI cao nhất.
- Thêm từng thành phần khi có *lỗi thật* đòi hỏi nó, và đo bằng eval trước và sau. Bỏ thành phần khi model mới khiến nó thừa.

> Harness không làm model thông minh hơn. Nó làm đầu ra của model đáng tin, và làm cho mỗi lỗi
> chỉ xảy ra một lần. Hệ thống tốt là hệ thống đơn giản nhất còn đạt được điều đó.

## Kết lại chuỗi bài

Sáu bài là một đường đi duy nhất. RAG đưa kiến thức ngoài vào context. LangChain cho các khối tiêu
chuẩn để lắp pipeline. LangGraph cho state và nhánh khi pipeline không còn thẳng. Agent cho model
quyền tự quyết bước tiếp theo, MCP cho nó một cách nói chuyện chung với mọi tool. Harness
engineering là lớp cuối: biến tất cả những điều đó thành một hệ thống chạy dài hơi, có kiểm chứng,
có trace, và có thể tiếp tục sau khi đứt phiên. Model sẽ còn mạnh lên, và một phần harness hôm nay
sẽ thừa; nhưng câu hỏi "model còn chưa tự làm được gì, và ta bù bằng cấu trúc nào" thì vẫn ở đó.
