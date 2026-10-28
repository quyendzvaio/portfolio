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

Khoá học mở bài 02 bằng một hình ảnh, và mình mượn luôn vì nó nói đúng bản chất. Hình dung bạn
là một kỹ sư mới được tuyển, bị thả vào một dự án không có một dòng tài liệu. Không README, code
không có chú thích, không ai nói chạy test bằng lệnh gì, file cấu hình CI chôn ở đâu đó. Bạn có
viết được code tốt không? Có thể, nếu bạn đủ giỏi và đủ kiên nhẫn. Nhưng bạn sẽ tốn phần lớn thời
gian để "đoán xem dự án này là gì" thay vì giải bài toán. Agent ở đúng tình cảnh đó, và còn tệ
hơn: bạn ít ra còn hỏi được đồng nghiệp ngồi cạnh; agent chỉ thấy đúng những file bạn đưa cho nó và
chỉ chạy được những lệnh bạn cho phép.

Từ đó, định nghĩa của khoá học rất gọn: harness là *mọi thứ nằm ngoài trọng số của model*. Trọng
số là phần "bộ não" đã được huấn luyện xong, bạn không sửa được. Mọi thứ còn lại bạn dựng quanh nó,
từ tờ chỉ dẫn, bộ dụng cụ, chỗ làm việc, cuốn sổ ghi tiến độ, cho tới cách kiểm tra kết quả, đều là
harness. Nói nôm na: cái gì không phải trọng số thì là harness. Đi kèm là một nguyên tắc nghe lạ
nhưng rất quan trọng: *repo là nguồn sự thật duy nhất*. Thứ gì agent không nhìn thấy trong repo thì,
với nó, thứ đó không tồn tại. Quy ước nằm trong đầu bạn hay trong một tin nhắn Slack ba tháng trước
coi như không có.

Vậy harness giúp gì cho agent? Nó giúp bộ não làm việc dài mà không trôi: biết mình đang ở đâu sau
khi "trí nhớ ngắn hạn" đầy, không lặp lại lỗi đã mắc, không tự ý mở rộng việc, không làm điều bị
cấm, và không được nói "xong" cho đến khi có bằng chứng. Harness không làm model thông minh thêm
chút nào. Khoá học nói thẳng: *model quyết định viết code gì; harness quyết định khi nào, ở đâu và
viết thế nào*. Nó không làm model giỏi hơn; nó làm đầu ra của model đáng tin.

### Công thức này từ đâu ra

Công thức ngắn đến mức dễ bị coi là khẩu hiệu, nên nói rõ nguồn. Khoá học
[learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md) tự nhận mình tổng hợp từ hai nguồn chính: bài harness engineering
của OpenAI và các bài về harness cho agent chạy dài của Anthropic. Thuật ngữ *harness engineering*
được Mitchell Hashimoto dùng trong bài
[My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey) (tháng 2/2026) với
định nghĩa rất thực dụng: mỗi lần agent mắc lỗi, bạn bỏ công kỹ thuật hoá một giải pháp để nó
*không bao giờ* mắc lại lỗi đó. Công thức "Agent = Model + Harness" được Vivek Trivedy viết thành
câu trong bài
[The anatomy of an agent harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness)
của LangChain (tháng 3/2026), với định nghĩa trùng với khoá học: harness là *mọi đoạn code, cấu
hình và logic thực thi không phải là model*. Anthropic không dùng công thức đó, nhưng gọi Claude
Agent SDK là "một agent harness đa dụng" trong
[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
và từ cuối 2024 đã mô tả agent trong
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) là
"LLM dùng tool dựa trên phản hồi từ môi trường, trong một vòng lặp". Vòng lặp và môi trường ấy
chính là harness, chỉ chưa có tên.

![Sơ đồ Agent = LLM + harness: model ở giữa, năm hệ con của harness theo bài 02 bao quanh (Instructions, Tools, Environment, State, Feedback), bên dưới là hai kỷ luật vận hành theo README (Scope và Session lifecycle)](blog/harness-engineering-agent-anatomy.svg)

Harness mang lại gì cho agent? Năm thứ, và chúng đối ứng với năm kiểu thất bại mà
[bài 01](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-01-why-capable-agents-still-fail/index.md) của khoá học liệt kê:

- **Bền trên việc dài.** Việc thật kéo qua nhiều context window và nhiều phiên; không có state ngoài context thì mỗi phiên bắt đầu từ số không.
- **Đi đúng hướng.** Agent hay làm quá nhiều việc cùng lúc hoặc tự đổi mục tiêu; harness giữ phạm vi và định nghĩa "xong".
- **Không lặp lại lỗi.** Mỗi lỗi được chuyển thành một quy tắc hoặc một bước kiểm tra tự động, đúng tinh thần Hashimoto.
- **An toàn.** Quyền, sandbox, giới hạn chi tiêu: agent chỉ làm được những gì bạn cho phép.
- **Đo được.** Trace và eval biến "cảm giác nó ổn" thành số liệu, để bạn biết thay đổi nào thực sự có ích.

Một câu đáng nhớ từ bài của Anthropic về harness (không phải từ khoá học): *mỗi thành phần trong
harness mã hoá một giả định về điều model chưa tự làm được*. Khi model mạnh lên, vài thành phần trở
nên thừa (tác giả bỏ được context reset khi chuyển lên Opus 4.5, bỏ sprint khi lên Opus 4.6), nhưng
không gian harness không co lại mà *dịch chuyển*. Khoá học nói cùng ý bằng cách khác ở bài 02:
harness mục như code, phải kiểm định và trả nợ harness như trả nợ kỹ thuật.

## Các thành phần của harness, theo khoá học

[Bài 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md) của khoá học định nghĩa harness bằng một công thức năm phần:
**Harness = Instructions + Tools + Environment + State + Feedback**. Đây cũng là khung mà khoá học
dùng để mổ xẻ bốn sản phẩm thật (Pi, Claude Code, Codex, DeepSeek) trong mục
[harness designs](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/harness-designs/index.md). Thiếu bất kỳ phần nào, harness coi là chưa hoàn chỉnh và agent "dùng lúc
nào cũng thấy gượng". Dưới đây mình đi qua từng phần theo một khuôn: bản chất nói nôm na, thứ cụ
thể khoá học bảo bạn tạo ra, và lỗi nó chặn được.

### Instructions: tờ giấy trên bàn người mới

Nói đơn giản, đây là tờ giấy bạn để trên bàn người mới ngày đầu: dự án này là gì, việc là gì, xong
là thế nào, team làm theo lệ gì. Không có tờ giấy đó, agent làm sai không phải vì kém, mà vì phải
đoán.

Khoá học bảo bạn tạo một file `AGENTS.md` (hoặc `CLAUDE.md`) ở gốc repo, gồm: tổng quan và mục đích
dự án, stack và phiên bản, lệnh chạy lần đầu, các ràng buộc cứng không được vi phạm, và link tới tài
liệu chi tiết. [Bài 04](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-04-why-one-giant-instruction-file-fails/index.md) thêm quy tắc kích cỡ: khoảng 100 dòng, là một *trang mục lục*, không
phải bách khoa; chi tiết tách ra `docs/` để agent đọc khi cần. [Bài 01](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-01-why-capable-agents-still-fail/index.md) thêm thứ quan trọng
nhất trong tờ giấy: một *định nghĩa xong* kiểm được bằng lệnh, kiểu "endpoint `GET /api/search?q=`,
phân trang 20, pass `pytest` và `mypy --strict`", thay cho câu "thêm tìm kiếm". Lỗi chặn được: hai
lỗi hàng đầu của bài 01, yêu cầu mơ hồ và quy ước ngầm chưa viết ra. Khoá học còn nói một câu đáng
ghim: một file `AGENTS.md` có thể hiệu quả hơn nâng cấp lên model đắt hơn.

### Tools: bộ dụng cụ, vừa đủ và có nhãn

Đây là bộ dụng cụ trên bàn. Thợ giỏi mà không có tuốc-nơ-vít thì chỉ đứng nhìn; đưa cả thùng dụng
cụ lẫn lộn không nhãn thì cầm nhầm.

Bài 02 đặt hai vế cho hệ con này. Vế một: cho agent *đủ* quyền dùng tool; đừng tắt shell "cho an
toàn", vì agent không chạy được cả `pip install` thì làm gì được. Vế hai: cũng không mở hết, mà
theo nguyên tắc tối thiểu đặc quyền. Với coding agent, danh sách tool của khoá học là shell, đọc
ghi file, git, cùng startup script và lệnh test. Lỗi chặn được: agent "muốn làm mà không làm được",
hoặc có quá nhiều tool chồng lấn nên chọn sai. Bài
[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
của Anthropic bổ sung phần "nhãn": mô tả tool phải viết như brief cho người mới, trả về thông tin
giàu tín hiệu, và báo lỗi phải nói cách sửa.

### Environment: cái xưởng tự mô tả

Đây là cái xưởng: máy có điện chưa, phần mềm đúng phiên bản chưa, cửa nào được mở. Xưởng hỏng thì
thợ mất cả buổi sửa xưởng thay vì làm việc được giao.

Khoá học yêu cầu môi trường *tự mô tả*: khoá dependency bằng `pyproject.toml` hay `package.json`,
ghim phiên bản runtime bằng `.python-version` hay `.nvmrc`, và dùng Docker hoặc devcontainer để
dựng lại y hệt ở bất cứ đâu. [Bài 06](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-06-why-initialization-needs-its-own-phase/index.md) tách *khởi tạo* thành pha riêng, với `init.sh` (cài,
kiểm tra, khởi động) và một checklist sẵn sàng gồm bốn điều: chạy được, test được, thấy tiến độ,
biết bước tiếp. Codex, theo bài 02, còn tách mỗi task ra một git worktree riêng để các thay đổi
không dẫm lên nhau. Lỗi chặn được: agent đốt context window vào lỗi cài đặt và xung đột phiên bản.
Với agent nghiên cứu, xưởng còn gồm danh sách domain được phép tải và giới hạn kích cỡ trang, để một
trang web lạ không chiếm quyền agent.

### State: cuốn sổ và cái tủ

Nếu context (những gì model đang "nhìn thấy") là mặt bàn, thì state là cuốn sổ và cái tủ: đã làm
gì, đang làm gì, còn gì, ghi ra ngoài để ca sau mở ra đọc. Không có sổ, mỗi ca làm việc mới bắt
đầu như chưa từng có ca trước.

Thứ cụ thể khoá học bảo tạo ở bài 02 là một file `PROGRESS.md` đơn giản với ba mục: đã xong, đang
làm, bị chặn; cập nhật trước khi kết thúc phiên, đọc khi mở phiên mới. [Bài 05](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/index.md) mở rộng
thành bộ ba: file tiến độ, nhật ký quyết định, và commit git làm điểm khôi phục, với một chỉ số để
đo: *chi phí dựng lại*, tức thời gian phiên mới cần để làm việc được. [Bài 08](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/index.md) thêm danh sách
feature máy đọc được, mỗi mục là bộ ba (mô tả hành vi, lệnh kiểm chứng, trạng thái), và trạng thái
chỉ chuyển sang `passing` khi lệnh kiểm chứng chạy qua. Lỗi chặn được: mất liên tục giữa các phiên,
làm lại việc đã xong, hoặc "nhìn quanh thấy có tiến độ rồi tuyên bố xong cả dự án".

Quản lý context trong một phiên cũng thuộc hệ con này, vì cùng là chuyện "giữ cái gì, bỏ cái gì".
Khi mổ xẻ [Claude Code](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/harness-designs/claude-code/index.md), khoá học cho thấy nó nén context theo nhiều tầng: cắt không mất mát
trước (xoá kết quả tool thừa), chưng cất có cấu trúc sau, tóm tắt bằng LLM cuối cùng, có cầu chì
chống nén quá tay. Bài
[context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
của Anthropic nêu cùng ba kỹ thuật cho việc dài: compaction, ghi chú có cấu trúc ngoài context, và
sub-agent trả về bản tóm tắt.

### Feedback: người chấm bài, tách khỏi người làm bài

Đây là người chấm bài. Tự chấm bài mình thì ai cũng thấy mình đúng, agent cũng vậy. "Xong" phải
được chứng minh bằng một bài kiểm tra chạy được, không phải bằng cảm giác.

Bài 02 gọi đây là hệ con có *lợi suất đầu tư cao nhất*, và việc cụ thể rất rẻ: liệt kê thẳng các
lệnh kiểm chứng trong `AGENTS.md` (test, type-check, lint, và một lệnh chạy tất cả). [Bài 09](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-09-why-agents-declare-victory-too-early/index.md)
xếp kiểm chứng thành ba lớp phải qua lần lượt: cú pháp, hành vi (test chạy, app khởi động), hệ
thống (end-to-end). [Bài 10](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-10-why-end-to-end-testing-changes-results/index.md) cho thấy test end-to-end không chỉ bắt lỗi mà còn đổi cách
agent viết code, và quy tắc kiến trúc phải *chạy được* chứ không nằm trong tài liệu. [Bài 13](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-13-loop-engineering/index.md)
nâng thành nguyên tắc: *maker và checker phải tách nhau*, đôi khi là hai model khác nhau. Log và
trace cũng nằm ở đây: bài 02 kể Codex đi kèm cả bộ quan sát (log, metric, trace) để mỗi thay đổi
được kiểm trong môi trường riêng, và [bài 11](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/index.md) chia quan sát thành hai lớp, runtime (hệ thống
đã làm gì) và process (vì sao thay đổi này nên được chấp nhận: sprint contract, rubric chấm). Lỗi
chặn được: lỗi phổ biến nhất, *tuyên bố thắng sớm*. Bài
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
của Anthropic bổ sung vốn từ để đo: task, trial, grader, transcript, outcome; chấm kết quả chứ
không chấm đường đi; và pass^k để đo độ ổn định.

### Hai kỷ luật vận hành: Scope và Session lifecycle

[README](https://github.com/walkinglabs/learn-harness-engineering#what-harness-engineering-actually-means) của khoá học kể năm hệ con theo một cách khác, nhìn từ *việc harness phải làm*:
Instructions, State, Verification, Scope, Session Lifecycle. Ba cái đầu trùng với bài 02 (Verification
chính là Feedback). Hai cái còn lại không phải lớp kỹ thuật mới, mà là hai kỷ luật vận hành đặt lên
trên năm lớp kia.

**Scope.** Đây là quy tắc "một việc một lúc". Ai từng mở năm việc cùng lúc đều biết kết cục: cái
nào cũng dở. Agent y hệt, chỉ khác là nó làm dở nhanh hơn. README nói: giới hạn agent ở một feature
mỗi lần, không làm quá, không làm dở ba việc, không sửa danh sách feature để giấu việc chưa xong.
[Bài 07](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-07-why-agents-overreach-and-under-finish/index.md) gọi đây là WIP=1 (chỉ một việc đang mở) và chỉ ra cặp lỗi song sinh *overreach* (làm
quá) và *under-finish* (dang dở); khoá học đo được với cùng tám feature, chế độ tự do để lại ba cái
làm dở, chế độ WIP=1 sau bốn phiên xong bảy. Ranh giới của việc phải nằm trong file, và file đó
chính là danh sách feature của bài 08.

**Session lifecycle.** Đây là thủ tục đầu ca và cuối ca. Đầu ca: đọc tờ chỉ dẫn, chạy `init.sh`,
đọc sổ tiến độ, xem danh sách việc, xem lịch sử git, rồi chọn *một* việc. Cuối ca: cập nhật sổ, cập
nhật danh sách việc, ghi lại cái gì còn hỏng, commit khi an toàn, và để lại đường khởi động sạch cho
ca sau. [Bài 12](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md) định nghĩa "trạng thái sạch" bằng năm điều kiện không được thiếu cái nào:
build qua, test qua, tiến độ đã ghi, không còn file tạm, và có đường khởi động. Thiếu một, phiên coi
như chưa xong.

| README (việc phải làm) | Bài 02 (lớp kỹ thuật) | Ghi chú |
|---|---|---|
| Instructions | Instructions | trùng |
| State | State | trùng; context trong phiên cũng ở đây |
| Verification | Feedback | cùng một thứ, hai tên |
| Scope | (kỷ luật trên State) | WIP=1, feature list là ranh giới |
| Session Lifecycle | (kỷ luật trên Environment và State) | init đầu phiên, clean state cuối phiên |
| | Tools, Environment | README gộp vào "môi trường làm việc" |

Cuối cùng là cách *chọn* thành phần cần đầu tư, cũng từ bài 02. Thứ nhất, kiểm định năm phần: chấm
mỗi hệ con từ 1 đến 5, lấy phần thấp nhất ra sửa 30 phút rồi xem agent đổi thế nào. Thứ hai, loại
trừ từng phần: giữ model cố định, bỏ từng hệ con một, xem bỏ cái nào làm tụt nhiều nhất. Khoá học
kể một team dùng cùng GPT-4o cho dự án React 20 nghìn dòng: chỉ README, 1 trong 5 lần chạy thành
công; thêm `AGENTS.md`, 60%; thêm lệnh kiểm chứng, 80%; thêm file tiến độ, ổn định 80 đến 100%.
Bốn vòng, không đổi model. Nhưng loại trừ chỉ nói "cái nào đang có giá nhất", không nói "nút thắt ở
đâu"; muốn biết điều đó bạn phải đọc log lỗi và quy từng lỗi về một lớp.

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
trong sơ đồ thành một node và state của graph thay cho `PROGRESS.md` và `questions.json`; các thành phần harness vẫn
y nguyên, chỉ đổi chỗ đứng.

```text
research-agent/
├── AGENTS.md                 # [Instructions] bản đồ ~100 dòng: mục đích, quy tắc, kiểm
├── docs/
│   ├── report-format.md      # [Instructions] báo cáo xong trông thế nào: định nghĩa xong
│   └── source-policy.md      # [Instructions] nguồn nào được tính, trích dẫn ra sao
├── init.sh                   # [Lifecycle] cài, kiểm key, chạy thử một search, in tiến độ
├── pyproject.toml            # [Environment] khoá dependency và phiên bản Python
├── .devcontainer/            # [Environment] dựng lại y hệt; allow-list mạng
├── config.yaml               # [Environment] model, ngân sách, ngưỡng nén, domain
├── agent/
│   ├── loop.py               # vòng lặp: gọi model -> chạy tool -> ghi state -> xét dừng
│   └── prompts/
│       ├── system.md         # [Instructions] vai và quy trình model đọc mỗi lượt
│       └── compaction.md     # [State] bản tóm tắt lịch sử phải giữ gì, bỏ gì
├── tools/                    # [Tools] tối thiểu đặc quyền: cờ chỉ-đọc / có mạng
│   ├── registry.py           # danh bạ tool: tên, mô tả, schema, cờ quyền
│   ├── search.py             # tìm trong domain được phép: tiêu đề + URL + trích
│   ├── fetch.py              # tải trang -> text sạch, cắt theo giới hạn, lưu bản gốc
│   ├── notes.py              # ghi và đọc lại ghi chú: claim, quote, url
│   ├── submit_report.py      # [Feedback] nộp cho checker; đường duy nhất tới "xong"
│   └── mcp_server.py         # bày các tool trên qua MCP cho agent khác dùng lại
├── harness/
│   ├── policy.py             # [Tools] cổng quyền: tool nào, domain nào, bao nhiêu lần
│   ├── context.py            # [State] nén context: xoá kết quả cũ, rồi tóm tắt
│   ├── budget.py             # [Lifecycle] đếm bước, token; quyết định dừng
│   ├── handoff.py            # [Lifecycle] kiểm trạng thái sạch, viết bàn giao
│   ├── tracing.py            # [Feedback] trace.jsonl: mỗi bước, tool call, kết quả
│   └── verifiers/            # [Feedback] checker tách khỏi model, code thuần
│       ├── citations.py      # mọi số liệu có [n]; mọi [n] trỏ tới URL đã fetch
│       └── structure.py      # đủ mục, đủ số nguồn tối thiểu, không đoạn trống
├── evals/                    # [Feedback] 30 câu hỏi từ lỗi thật; k lần, pass^k
│   ├── tasks.jsonl
│   └── run_evals.py
└── runs/
    └── 2026-10-28_harness-evidence/
        ├── PROGRESS.md       # [State] đã xong / đang làm / bị chặn / bước tiếp
        ├── questions.json    # [Scope] câu hỏi con + trạng thái; một active một lúc
        ├── notes.md          # [State] ghi chú agent tự viết, đọc lại sau khi nén
        ├── sources/          # [State] bản gốc từng trang, để checker đối chiếu
        ├── trace.jsonl       # [Feedback] trace của lần chạy
        └── report.md         # chỉ tồn tại khi checker đã qua
```

Nhãn trong ngoặc vuông là hệ con của khoá học mà mỗi phần thuộc về. Đọc theo nhãn, bạn thấy đủ
năm lớp của bài 02 (Instructions, Tools, Environment, State, Feedback) và hai kỷ luật của README
(Scope qua `questions.json`, Lifecycle qua `init.sh`, `budget.py`, `handoff.py`). Hai thư mục
`agent/` và `tools/` là phần người đọc quen thấy trong mọi demo. Thư mục `harness/` là phần làm nên
khác biệt giữa demo và hệ thống, và nó không import gì từ model: thay model, đổi framework,
`harness/` vẫn dùng được. `evals/` và `runs/` là bằng chứng: không có chúng, bạn chỉ có cảm giác.

### Đi một câu hỏi qua hệ thống

**Đầu ca (Lifecycle).** Bạn chạy `init.sh`: nó cài dependency theo lockfile, kiểm tra key, chạy thử
một lần search để chắc mạng và allow-list hoạt động, rồi in trạng thái. Sau đó khởi động agent với
câu hỏi. Vòng lặp làm đúng thủ tục đầu ca của README: đọc `AGENTS.md`, tạo thư mục run với
`PROGRESS.md` trống và `questions.json` trống, mở `trace.jsonl`.

**Lập kế hoạch (Instructions, Scope).** Bước 0, model nhận system prompt (vai, quy trình, format
báo cáo từ `docs/report-format.md`) và viết kế hoạch: ba câu hỏi con (thí nghiệm có đối chứng cùng
model, benchmark trước và sau khi đổi harness, nghiên cứu loại trừ từng phần) và loại nguồn ưu tiên.
Harness ghi ba câu hỏi con vào `questions.json`, mỗi câu kèm trạng thái và tiêu chí xong ("ít nhất
hai nguồn đã fetch, có ghi chú"), đúng kiểu bộ ba của bài 08. Chỉ một câu được đánh `active`. Đây là
WIP=1 của bài 07 áp vào nghiên cứu: model không được tìm cho cả ba câu cùng lúc.

**Tìm, đọc, ghi chú (Tools, Environment).** Bước 1 đến 4, model gọi `search` cho câu hỏi con đang
active. Mỗi lời gọi đi qua cổng quyền: `search` là tool chỉ đọc, được phép, nhưng kết quả bị lọc theo
domain trong `config.yaml`. Tool trả về tối đa tám kết quả, mỗi kết quả chỉ có tiêu đề, URL, một
đoạn trích. Model chọn ba URL và gọi `fetch`; môi trường giới hạn 200 KB và 15 giây mỗi trang, lưu
bản gốc vào `sources/`, trả về text sạch đã cắt kèm chỉ dẫn đọc tiếp nếu trang dài. Đọc xong, model
gọi tool ghi chú với ba trường: claim (một câu), quote (nguyên văn, ngắn), url. Harness ghi vào
`notes.md` và đánh dấu URL là *đã fetch*. Khi câu hỏi con đạt tiêu chí, harness (không phải model)
chuyển nó sang `passing` trong `questions.json` và mở câu tiếp theo.

**Nén context (State).** Bước 12, bộ đếm báo context ước tính đã vượt ngưỡng 120 nghìn token. Harness
làm hai việc theo thứ tự: xoá nội dung các kết quả tool cũ (giữ sáu kết quả gần nhất), vì đó là cách
nén nhẹ và an toàn nhất; đo lại, nếu vẫn dài thì gọi model với `compaction.md` để tóm tắt phần lịch
sử cũ, giữ đúng những gì file đó yêu cầu: kế hoạch, câu hỏi con đã đóng, nguồn đã đọc và chưa đọc,
nghi vấn chưa giải quyết. Agent không hoảng vì mất chi tiết: chi tiết nằm trong `notes.md` và
`questions.json`, nó đọc lại được.

**Nộp và kiểm (Feedback).** Bước 20, cả ba câu hỏi con đã `passing`, model viết bản nháp và gọi
`submit_report`. Đây là chỗ harness tỏ rõ ý đồ: nộp báo cáo *là một tool*, và tool đó chạy checker
trong `verifiers/`. Checker trích dẫn thấy đoạn ba nêu một con số không kèm `[n]`, và `[4]` trỏ tới
một URL có trong kết quả search nhưng chưa từng được fetch. Tool trả về một kết quả lỗi với hai dòng
nói đích danh đoạn nào, URL nào, và cách sửa ("fetch URL rồi ghi chú, hoặc bỏ claim"). Model fetch
trang đó, ghi chú, sửa bản nháp, nộp lại ở bước 23. Checker qua, `report.md` được ghi.

**Cuối ca (Lifecycle).** Trước khi thoát, `handoff.py` chạy kiểm trạng thái sạch theo năm điều kiện
của bài 12, dịch sang agent nghiên cứu: báo cáo đã qua checker, `PROGRESS.md` đã cập nhật,
`questions.json` khớp với thực tế, không còn file tạm trong `sources/`, và lệnh chạy lại hoạt động.
Nếu ngân sách 40 bước hoặc 400 nghìn token cạn trước bước 23, vòng lặp không cố nộp một báo cáo chưa
kiểm; nó ghi vào `PROGRESS.md` đang ở đâu, thiếu gì, bước tiếp là gì, và thoát với mã lỗi. Lần sau
chạy lại với cùng run, agent đọc `PROGRESS.md`, `questions.json` và `notes.md`, bắt đầu từ bước 23
chứ không phải bước 0. Suốt quá trình `trace.jsonl` có một dòng cho mỗi bước và mỗi tool call;
`run_evals.py` chạy lại câu hỏi này cùng 29 câu khác ba lần mỗi câu và báo pass^3, con số cho biết
hệ thống *ổn định* đến đâu chứ không chỉ "có lúc đúng".

### Bốn mảnh quyết định độ tin cậy

Không cần đọc code để hiểu harness này. Chỉ cần biết từng mảnh làm gì, nằm ở đâu trong cây thư mục,
và vì sao thiếu nó thì hệ thống trôi.

| Mảnh | Nằm ở | Hệ con | Làm gì | Vì sao phải có |
|---|---|---|---|---|
| Vòng lặp | agent/loop.py | khung của cả harness | gọi model, chạy tool, ghi state, xét dừng | model không được tự tuyên bố xong |
| Cổng quyền | harness/policy.py | Tools | duyệt từng lời gọi tool trước khi chạy | chặn domain lạ, tool cấm, gọi quá tay |
| Checker | harness/verifiers/ | Feedback | soát báo cáo bằng code thuần | model tự chấm thì luôn thấy mình đúng |
| Nén context | harness/context.py | State | dọn kết quả cũ, rồi tóm tắt | việc dài vượt quá một context window |

**Vòng lặp.** Mỗi vòng làm đúng một chuỗi việc: kiểm ngân sách (số bước, số token) và dừng nếu cạn;
nén context nếu đã vượt ngưỡng; gọi model với system prompt, bản rút gọn của `PROGRESS.md` và `questions.json` cùng danh
sách tool; nếu model gọi tool thì từng lời gọi đi qua cổng quyền rồi mới chạy, kết quả (kể cả lỗi,
kèm lý do) được trả lại cho model; cuối vòng ghi `PROGRESS.md` để phiên sau tiếp tục được. Hai quyết
định thiết kế nằm ở đây. Thứ nhất, model ngừng nói không có nghĩa là xong: "xong" chỉ có một đường
là `submit_report` chạy qua checker; nếu model dừng mà chưa nộp, vòng lặp nhắc nó tiếp tục. Đây là
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
