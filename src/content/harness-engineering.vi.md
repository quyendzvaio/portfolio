---
title: "Harness engineering: Agent = LLM + harness"
date: "2026-10-28"
tags: ["agents", "harness", "llmops"]
summary: "Vì sao một LLM giỏi vẫn làm hỏng việc dài hơi, harness gồm những gì, và cách thiết kế một research agent có harness đầy đủ, nhìn cây thư mục là hiểu."
---

# Harness engineering: Agent = LLM + harness

Ở [bài 5](#/blog/mcp-model-context-protocol) mình đã cho agent một ổ cắm chuẩn để nối với mọi
tool: MCP. Đến đây model đã thông minh, tool đã đủ trong tay. Vậy mà giao cho nó một việc dài vài
chục bước, bạn vẫn sẽ thấy nó trôi dần: quên mất mình đã làm gì, lặp lại lỗi cũ, báo "xong" quá sớm,
hoặc làm cả những việc không được phép. Thứ sửa được chuyện này không phải một model thông minh hơn,
mà là môi trường dựng quanh model. Bài cuối này nói về môi trường đó: harness.

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

Nói nôm na thế này. Model là bộ não: nó đọc, suy nghĩ và quyết định bước tiếp theo. Nhưng một bộ
não đứng một mình không làm xong được một việc dài. Nó cần một bản mô tả việc cần làm, một cái bàn
với dụng cụ, một cuốn sổ ghi lại những gì đã làm, vài quy tắc về điều được và không được làm, và một
người kiểm tra lại trước khi được nói "xong". Toàn bộ phần "xung quanh bộ não" ấy gọi là harness.
Agent là bộ não cộng với phần xung quanh đó.

Hình dung thế này. Bạn tuyển được một kỹ sư rất giỏi. Ngày đầu, bạn ném cho họ một câu "làm tính
năng tìm kiếm nhé" rồi đi họp. Không tài liệu, không ai nói cách chạy thử, không ai nói quy ước của
team, không ai review. Người đó vẫn giỏi, nhưng sẽ đoán sai yêu cầu, dùng nhầm thư viện, và tự tin
báo xong vì không có gì để tự kiểm. Cũng người đó, với một bản brief rõ, một máy đã cài sẵn, một
checklist "xong là thế nào", quyền truy cập vừa đủ, và một người review độc lập, sẽ làm ra sản phẩm
dùng được. Người không đổi; thứ đổi là mọi thứ quanh người đó. Agent cũng y như vậy, và còn khó hơn:
người mới ít nhất còn hỏi được đồng nghiệp, agent chỉ thấy đúng những file bạn đưa và những lệnh bạn
cho chạy. Khoá học dùng đúng hình ảnh này ở
[bài 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md).

Vậy harness giúp gì cho agent? Nó giúp bộ não làm việc dài mà không trôi: biết mình đang ở đâu sau
khi "trí nhớ ngắn hạn" đầy, không lặp lại lỗi đã mắc, không tự ý mở rộng việc, không làm điều bị
cấm, và không được nói "xong" cho đến khi có bằng chứng. Harness không làm model thông minh thêm
chút nào. Nó làm cho sự thông minh đó cho ra kết quả đáng tin.

### Công thức này từ đâu ra

Công thức ngắn đến mức dễ bị coi là khẩu hiệu, nên nói rõ nguồn. Thuật ngữ *harness engineering*
được Mitchell Hashimoto dùng trong bài
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

Nói bằng ngôn ngữ kỹ thuật hơn, harness gồm: vòng lặp gọi model rồi chạy tool, bộ tool và mô tả
của chúng, cách quản lý context (những gì model được nhìn thấy ở mỗi bước), bộ nhớ và state ngoài
context, môi trường chạy (sandbox, giới hạn), quyền và guardrail (được làm gì, không được làm gì),
kiểm chứng và phản hồi (sao biết là đúng), quan sát (trace, log, eval) và phục hồi (lỗi rồi làm gì
tiếp).

![Sơ đồ Agent = LLM + harness: model ở giữa, tám thành phần harness bao quanh, vòng lặp gọi model và chạy tool nối chúng lại](blog/harness-engineering-agent-anatomy.svg)

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

Nói đơn giản, đây là tờ giấy bạn để trên bàn người mới ngày đầu: việc là gì, xong là thế nào, team
làm theo lệ gì. Không có tờ giấy đó, agent làm sai không phải vì kém, mà vì phải đoán.

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

Đây là bộ dụng cụ trên bàn. Thợ giỏi mà không có tuốc-nơ-vít thì chỉ đứng nhìn; có cả thùng dụng
cụ lẫn lộn không nhãn thì cầm nhầm. Tool cũng cần tên và mô tả rõ như nhãn trên từng dụng cụ.

Chứa: các tool, mô tả, schema tham số, và cách chúng được bày ra (có thể qua MCP, như [bài 5](#/blog/mcp-model-context-protocol)).
Chặn: agent không có cách làm việc, hoặc có quá nhiều tool chồng lấn nên chọn sai. Bài
[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
của Anthropic định nghĩa tool là "hợp đồng giữa hệ xác định và agent bất định", và rút ra vài quy
tắc: ít tool nhưng trúng workflow thay vì bọc từng endpoint; `search_contacts` tốt hơn
`list_contacts` vì context có hạn; trả về thông tin giàu tín hiệu (bỏ UUID, bỏ mime type); có
tham số `response_format` để model chọn bản gọn hay bản đầy đủ; thông điệp lỗi phải nói *sửa thế
nào*, không chỉ "sai". Khoá học bổ sung nguyên tắc tối thiểu đặc quyền: không tắt shell "cho an
toàn" khiến agent không cài được gì, nhưng cũng không mở hết.

### Environment: môi trường tự mô tả

Đây là cái xưởng: máy có điện chưa, phần mềm đúng phiên bản chưa, cửa nào được mở. Xưởng hỏng thì
thợ mất cả buổi sửa xưởng thay vì làm việc được giao.

Chứa: nơi agent chạy, phiên bản runtime, dependency bị khoá, dữ liệu mẫu, và giới hạn (mạng, thời
gian, bộ nhớ). Chặn: agent đốt context window vào `pip install` lỗi và xung đột phiên bản thay vì
làm việc chính. Ví dụ từ bài 06: tách *initialization* thành pha riêng với `init.sh` (cài, kiểm
tra, khởi động) và một checklist "sẵn sàng" gồm bốn điều: chạy được, test được, thấy tiến độ, biết
bước tiếp. Với agent nghiên cứu, environment còn là allow-list domain được fetch và giới hạn kích
cỡ trang, để một trang web độc không biến thành prompt injection chiếm quyền agent.

### Context: tài nguyên hữu hạn, lợi suất giảm dần

Context là những gì model đang "nhìn thấy" lúc này, giống một cái bàn làm việc chỉ rộng có hạn.
Chất đầy giấy lên bàn thì tờ quan trọng bị vùi mất. Harness phải dọn bàn: cất giấy cũ vào tủ, chỉ
để lại thứ cần ngay.

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

Nếu context là cái bàn thì state là cuốn sổ và cái tủ: đã làm gì, đang làm gì, còn gì, ghi ra ngoài
để ca sau mở ra đọc. Không có sổ, mỗi ca làm việc mới bắt đầu như chưa từng có ca trước.

Chứa: file tiến độ, danh sách việc có trạng thái, lịch sử git, tài liệu bàn giao. Chặn: mất liên
tục giữa các phiên, làm lại việc đã xong, hoặc "nhìn quanh thấy có tiến độ rồi tuyên bố xong việc
cả dự án" (một thất bại Anthropic ghi lại nguyên văn). Ví dụ từ Anthropic: một `init.sh`, một
`claude-progress.txt` ghi những gì đã làm, một `feature_list.json` hơn 200 feature khởi đầu đều
`failing`, agent chỉ được lật trường `passes`, và cấm xoá hay sửa test. Họ chọn JSON thay Markdown
vì model ít tự ý sửa JSON hơn. Khoá học (bài 08) gọi mỗi mục trong danh sách là một bộ ba
*(mô tả hành vi, lệnh kiểm chứng, trạng thái)*, và quy định trạng thái chỉ đổi sang `passing` khi
lệnh kiểm chứng chạy qua, do harness thực hiện, không phải do agent tự ghi.

### Scope: một việc một lúc

Đây là quy tắc "một việc một lúc". Ai từng mở năm việc cùng lúc đều biết kết cục: cái nào cũng dở.
Agent y hệt, chỉ khác là nó làm dở nhanh hơn.

Chứa: giới hạn số việc đang mở (WIP, work in progress) và ranh giới của mỗi việc, ghi thành file.
Chặn: cặp lỗi song sinh bài 07 gọi là *overreach* (làm quá) và *under-finish* (dang dở). Ví dụ:
Anthropic yêu cầu coding agent chỉ làm một feature mỗi phiên và thấy đây là điểm mấu chốt chống xu
hướng "làm một phát hết cả app". Khoá học đo được: cùng tám feature, chế độ tự do để lại ba cái
làm dở; chế độ WIP=1 sau bốn phiên xong bảy. Dòng code và tỉ lệ hoàn thành tỉ lệ nghịch.

### Verification: tự tin không phải là đúng

Đây là người chấm bài, tách khỏi người làm bài. Tự chấm bài mình thì ai cũng thấy mình đúng, agent
cũng vậy. "Xong" phải được chứng minh bằng một bài kiểm tra chạy được, không phải bằng cảm giác.

Chứa: lệnh kiểm chứng, checker tự động, và một evaluator *tách khỏi* người làm. Chặn: lỗi phổ
biến nhất, *tuyên bố thắng sớm*. Bài 09 gọi đây là verification gap, khoảng cách giữa độ tự tin
của agent và độ đúng thật, và đề xuất ba lớp: cú pháp qua, hành vi qua (test chạy, app khởi động),
hệ thống qua (end-to-end). Anthropic rút ra bài học tương tự theo cách đau hơn: unit test và `curl`
đều qua nhưng app vỡ khi dùng thật; chỉ khi bắt agent dùng browser automation "test như người dùng"
kết quả mới cải thiện rõ. Và vì generator có xu hướng tự khen, họ tách evaluator riêng, kèm ngưỡng
cứng cho từng tiêu chí. Bài 13 của khoá học nâng điều này thành nguyên tắc: *maker và checker phải
tách nhau*, đôi khi là hai model khác nhau.

### Observability: không thấy thì không sửa

Đây là camera và sổ nhật ký của xưởng: ai làm gì lúc nào, tốn bao nhiêu, kết quả ra sao. Không có
nó, khi hỏng bạn chỉ biết "nó hỏng", không biết sửa chỗ nào.

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

Thiết kế dưới đây giả định gọi thẳng API của model qua SDK chính thức và tự viết vòng lặp, để mọi
thành phần harness lộ ra thay vì ẩn trong framework; phần tool có thể bọc MCP. Nếu bạn dùng LangGraph như [bài 4](#/blog/langgraph-ai-agents), mỗi ô
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
│   ├── registry.py           # danh bạ tool: tên, mô tả, schema, hàm, cờ chỉ-đọc/mạng
│   ├── search.py             # tìm web: lọc domain, trả title+url+snippet gọn
│   ├── fetch.py              # tải trang -> text sạch, cắt theo giới hạn, lưu bản gốc
│   ├── notes.py              # ghi và đọc lại ghi chú có cấu trúc: claim, quote, url
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
nhất. Agent không hoảng vì mất chi tiết: chi tiết nằm trong `notes.md`, nó có thể gọi tool ghi chú để đọc lại.

Bước 20, model thấy ba câu hỏi con đều có ít nhất hai nguồn và viết bản nháp, rồi gọi
`submit_report`. Đây là chỗ harness tỏ rõ ý đồ: nộp báo cáo *là một tool*, và tool đó chạy
`verifiers/`. `citations.py` thấy đoạn ba có một con số không kèm `[n]`, và `[4]` trỏ tới một URL
có trong kết quả search nhưng chưa từng được `fetch`. Tool trả về một kết quả lỗi với hai dòng
nói đích danh đoạn nào, URL nào, và cách sửa ("fetch URL rồi ghi chú, hoặc bỏ claim"). Model
fetch trang đó, ghi chú, sửa bản nháp, nộp lại ở bước 23. Verifier qua, `report.md` được ghi,
`progress.json` chuyển `done: true`, vòng lặp dừng.

Nếu ở bước 23 ngân sách 40 bước hoặc 400 nghìn token cạn trước, `loop.py` không cố nộp một báo cáo
chưa kiểm; nó ghi một mục bàn giao vào `progress.json` (đang ở đâu, thiếu gì, bước tiếp là gì) và
thoát với mã lỗi. Lần sau chạy `--resume` sẽ đọc tiến độ, ghi chú và danh sách nguồn, bắt đầu từ
bước 23 chứ không phải bước 0. Suốt quá trình, `trace.jsonl` có một dòng cho mỗi bước và mỗi tool
call; `run_evals.py` chạy lại câu hỏi này cùng 29 câu khác ba lần mỗi câu và báo pass^3, con số
cho biết hệ thống *ổn định* đến đâu chứ không chỉ "có lúc đúng".

### Bốn mảnh quyết định độ tin cậy

Không cần đọc code để hiểu harness này. Chỉ cần biết từng mảnh làm gì, nằm ở đâu trong cây thư mục,
và vì sao thiếu nó thì hệ thống trôi.

| Mảnh | Nằm ở | Làm gì | Vì sao phải có |
|---|---|---|---|
| Vòng lặp | agent/loop.py | gọi model, chạy tool, ghi state, quyết định dừng | model không được tự tuyên bố xong |
| Cổng quyền | harness/policy.py | duyệt từng lời gọi tool trước khi chạy | chặn domain lạ, tool cấm, gọi quá tay |
| Verifier | harness/verifiers/ | soát báo cáo bằng code thuần | model tự chấm thì luôn thấy mình đúng |
| Nén context | harness/context.py | dọn kết quả cũ, rồi tóm tắt | việc dài vượt quá một context window |

**Vòng lặp.** Mỗi vòng làm đúng một chuỗi việc: kiểm ngân sách (số bước, số token) và dừng nếu cạn;
nén context nếu đã vượt ngưỡng; gọi model với system prompt, bản rút gọn của `progress.json` và danh
sách tool; nếu model gọi tool thì từng lời gọi đi qua cổng quyền rồi mới chạy, kết quả (kể cả lỗi,
kèm lý do) được trả lại cho model; cuối vòng ghi `progress.json` để phiên sau tiếp tục được. Hai quyết
định thiết kế nằm ở đây. Thứ nhất, model ngừng nói không có nghĩa là xong: "xong" chỉ có một đường
là `submit_report` chạy qua verifier; nếu model dừng mà chưa nộp, vòng lặp nhắc nó tiếp tục. Đây là
*pass-state gating* của khoá học áp vào báo cáo thay vì feature. Thứ hai, tool bị từ chối vẫn nhận
được câu trả lời có lý do, để model đổi hướng thay vì bị lặng lẽ bỏ qua. Khi ngân sách cạn, vòng lặp
không cố nộp một báo cáo chưa kiểm; nó ghi bàn giao và thoát.

**Tool và mô tả tool.** Mô tả tool là một prompt: nó nói cho model khi nào dùng tool, tham số nghĩa
là gì, kết quả trông thế nào, và cảnh báo quan trọng nhất của hệ này: kết quả tìm kiếm chỉ là ứng
viên, phải fetch trước khi được trích dẫn. Thân tool lo chuyện tiết kiệm context: lọc theo allow-list
domain, chỉ trả tiêu đề, URL và một đoạn trích, và ghi các URL đã thấy vào state để verifier đối
chiếu. Mỗi tool mang hai cờ, *chỉ đọc* và *có dùng mạng*, để cổng quyền xét duyệt mà không cần biết
từng tool; đó là cùng ý tưởng với annotation của MCP ở
[bài 5](#/blog/mcp-model-context-protocol). Muốn agent khác dùng lại bộ tool này, `tools/mcp_server.py`
chỉ bày đúng các hàm đó qua MCP, không viết lại logic.

**Verifier trích dẫn.** Verifier là code thuần, không gọi model, nên nó không "tự thuyết phục" rằng
lỗi không quan trọng, điều Anthropic quan sát được ở evaluator bằng LLM khi chưa tinh chỉnh. Nó làm
ba kiểm tra: đoạn nào nêu số liệu phải có một dấu trích dẫn; mỗi dấu trích dẫn phải có trong danh
sách nguồn cuối báo cáo; và URL của nguồn phải nằm trong danh sách URL *đã fetch* do harness ghi khi
tool `fetch` chạy, không phải do model khai. Một URL chỉ xuất hiện trong kết quả tìm kiếm chưa đủ để
được trích dẫn. Mỗi lỗi trả về kèm cách sửa ("fetch URL rồi ghi chú, hoặc bỏ claim"). Đây là cách
chặn lỗi "bịa nguồn" bằng cấu trúc, không bằng lời dặn trong prompt.

**Nén context.** Hai tầng, từ nhẹ đến nặng, luôn thử tầng nhẹ trước. Tầng một xoá nội dung các kết
quả tool cũ, giữ sáu kết quả gần nhất; không mất quyết định nào, vì quyết định nằm trong lời của
model, không nằm trong kết quả tool. Nếu vẫn dài, tầng hai gọi model với `compaction.md` để tóm tắt
phần lịch sử cũ thành một đoạn, giữ: kế hoạch và tình trạng từng câu hỏi con, URL đã đọc và chưa đọc,
nghi vấn còn mở, quyết định đã chốt; bỏ: nội dung trang đã ghi chú, các lần tìm không ra. Lịch sử
mới gồm bản tóm tắt cộng vài lượt gần nhất; chi tiết luôn còn trong `notes.md`. Nếu dùng Claude API,
bạn có thể thay tầng một bằng tính năng context editing và tầng hai bằng compaction phía server (cả
hai đang ở trạng thái beta); hiểu phiên bản tự thiết kế thì bạn biết mình đang bật cái gì. Lưu ý: với
các model mới nhất, sửa lịch sử đã gửi có thể làm mất hiệu lực các block suy luận trước đó, nên hãy
đọc tài liệu model trước khi tự nén theo cách ghi đè.

**Cấu hình và bằng chứng.** `config.yaml` là nơi mọi "giả định về điều model chưa làm được" nằm
thành con số, để nới ra khi model mạnh lên: model nào; tối đa 40 bước và 400 nghìn token; nén khi
vượt 120 nghìn token, giữ 6 kết quả tool gần nhất; allow-list domain, 200 KB và 15 giây mỗi trang;
tối thiểu 3 nguồn và mọi số liệu phải có trích dẫn. `evals/tasks.jsonl` có một dòng cho mỗi task,
gồm câu hỏi, các domain bắt buộc phải được trích, số nguồn tối thiểu, và các lỗi bị cấm (ví dụ số
liệu không có nguồn). `run_evals.py` chạy mỗi task k lần, chấm *outcome* (báo cáo cuối có qua grader
không) chứ không chấm đường đi, và báo cả pass@k lẫn pass^k. Với agent nghiên cứu mà người dùng tin
kết quả, pass^k là con số đáng nhìn: 75% mỗi lần nghe ổn, nhưng xác suất ba lần liền đều ổn chỉ
khoảng 42%.

## Khi nào không cần harness đầy đủ

Mỗi thành phần ở trên có giá: code phải bảo trì, token để tóm tắt, tiền cho evaluator, và thời
gian chạy. Harness đầy đủ của Anthropic đắt gấp 20 lần lời gọi trần. Vì vậy:

- Một câu hỏi trả lời được trong một lần tìm và một lần gọi model thì không cần agent, càng không cần harness; RAG của [bài 1](#/blog/rag-fundamentals) là đủ.
- Việc có đường đi cố định (tìm, tóm tắt, dịch) nên là workflow có code điều khiển, như Anthropic phân biệt với agent; verifier và trace vẫn hữu ích, nhưng bỏ vòng lặp mở.
- Bắt đầu bằng ba thứ rẻ nhất mà lợi nhất: định nghĩa xong kiểm được bằng lệnh, một verifier bằng code, và một file tiến độ. Khoá học và Anthropic đều xếp phản hồi kiểm chứng là thành phần có ROI cao nhất.
- Thêm từng thành phần khi có *lỗi thật* đòi hỏi nó, và đo bằng eval trước và sau. Bỏ thành phần khi model mới khiến nó thừa.

> Harness không làm model thông minh hơn. Nó làm đầu ra của model đáng tin, và làm cho mỗi lỗi
> chỉ xảy ra một lần. Hệ thống tốt là hệ thống đơn giản nhất còn đạt được điều đó.

## Kết lại chuỗi bài

Sáu bài là một đường đi duy nhất, mỗi bước sửa điểm yếu của bước trước. Một LLM đứng một mình
không biết dữ liệu của bạn và sẵn sàng bịa; [bài 1](#/blog/rag-fundamentals) đưa RAG vào để model
trả lời trên tài liệu thật. Nhưng tự ghép các mảnh của RAG rất mất công và mỗi vendor một kiểu, nên
[bài 2](#/blog/langchain-rag-from-scratch) dùng LangChain để các mảnh có hình dạng chuẩn, lắp vào
và thay ra được. Bản RAG đó chỉ đẹp trong demo; [bài 3](#/blog/rag-production-techniques) chỉnh
từng khâu để nó chịu được tài liệu thật, người dùng thật, và đo được bằng số. Dù tốt đến đâu, RAG vẫn
là đường một chiều, tra một lần rồi trả lời một lần; [bài 4](#/blog/langgraph-ai-agents) thêm vòng
lặp, nhánh và bộ nhớ chung bằng LangGraph, rồi để model tự quyết bước tiếp theo, tức là agent. Agent
chỉ hữu ích bằng tool của nó, mà mỗi tool lại là một API phải nối tay;
[bài 5](#/blog/mcp-model-context-protocol) đưa MCP vào làm ổ cắm chung. Và khi model đã thông minh,
tool đã đủ, việc dài vẫn trôi; bài này dựng harness quanh model để nó chạy dài hơi, tự kiểm chứng, để
lại dấu vết, và tiếp tục được sau khi đứt phiên. Model sẽ còn mạnh lên, và một phần harness hôm nay
sẽ thừa; nhưng câu hỏi "model còn chưa tự làm được gì, và ta bù bằng cấu trúc nào" thì vẫn ở đó.
