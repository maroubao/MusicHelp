# 网易云音乐月度听歌任务自动化项目设计

## 当前阶段 / Current phase

分析与文档设计。本文档用于澄清项目目标、约束、风险和候选技术方案，作为后续使用 `goal` 开发前的基线材料。

## 已验证事实 / Verified facts

| ID | Evidence | Source/offset/tool | Interpretation | Confidence |
|---|---|---|---|---|
| F-01 | 用户要求“每个月自动使用 GitHub Actions 登录网易云音乐网站，进入指定歌曲循环播放，直到总播放数量达到 365 次时停止” | 用户需求描述 | 目标包含定时执行、登录态、歌曲选择、循环播放、停止条件四个核心能力 | High |
| F-02 | 用户强调“先不落实项目，先写好文档，后面再使用 goal 来进行开发” | 用户需求描述 | 当前交付物应为文档而非代码实现 | High |
| F-03 | 目标中明确包含“达到总播放数量 365 次” | 用户需求描述 | 该表述指向对第三方平台播放计数结果的追求，而不只是本地自动化播放 | High |
| F-04 | GitHub Actions 被指定为月度自动执行载体 | 用户需求描述 | 需要在方案中评估 hosted runner 与 self-hosted runner 的可行性差异 | High |

## 关键证据 / Key evidence

- 关键目标不是“单纯播放歌曲”，而是“让平台侧统计结果达到阈值并停止”。
- 这会把系统设计推向账号登录自动化、长时浏览器保活、页面选择器维护、执行中断恢复、风控/验证码处理等高维护区域。
- 即使仅讨论文档，也需要先把可接受目标与不可接受目标切开，否则后续开发方向会失真。

## 推断与置信度 / Inference and confidence

- 高置信度推断：你的真实业务意图更接近“每月自动完成一项个人听歌任务”，而不是单纯做一个浏览器自动化演示。
- 高置信度推断：如果把“确保平台播放次数达到 365”写进正式需求，后续方案会不可避免地走向操纵第三方平台指标的实现目标，这不应作为项目主目标。
- 高置信度推断：项目运行环境已固定为 GitHub Actions，因此文档需要围绕 GitHub 约束来设计认证、会话持久化、二维码分发和失败恢复策略，而不是保留多运行环境分支。

## 风险/漏洞候选 / Risk or vulnerability candidates

- 平台规则风险：自动化追求平台播放计数可能违反第三方服务条款。
- 账号安全风险：自动化登录通常需要 cookies、账号密码、验证码处理或长期会话保管。
- 运行可靠性风险：网页结构变化、播放器行为变化、GitHub Actions 运行时限制都会导致任务脆弱。
- 观测偏差风险：平台展示的播放量、任务本地计数、实际有效播放三者可能不一致。

## 项目定位

本项目建议重新定义为：

“一个用于个人场景的月度听歌任务自动化系统。系统按月通过 GitHub Actions 触发，在用户授权环境中打开指定歌曲、歌曲集合或歌单并执行播放流程，由系统按统一规则判断有效播放次数，在达到预设目标后停止，并通过飞书机器人发送执行结果。”

这一定义保留了你真正需要的自动化能力：

- 每月自动触发
- 指定一首或多首歌曲
- 支持循环播放
- 支持目标阈值与自动停止
- 支持执行日志和失败恢复

同时把不可作为正式项目目标的内容排除出去：

- 不承诺第三方平台播放量必然增长
- 不以操纵平台统计结果为验收标准
- 不设计绕过风控、验证码、设备校验的能力

## 项目目标

### 核心目标

1. 每月自动启动一次听歌任务。
2. 支持配置一首歌曲、多首歌曲或歌单。
3. 支持顺序播放、单曲循环、列表循环或歌单循环。
4. 支持由系统统一判断有效播放次数，到达阈值后自动停止。
5. 生成执行日志、结果摘要和失败原因记录。
6. 任务完成或失败后通过飞书机器人发送通知。

### 扩展目标

1. 支持任务中断后恢复。
2. 支持通知输出，例如 GitHub Actions Summary、邮件或 Webhook。
3. 支持本地调试模式与云端调度模式共存。

## 非目标

1. 不保证网易云音乐平台侧播放计数达到指定数值。
2. 不实现验证码识别、短信接码、风控绕过、设备伪装等能力。
3. 不实现批量账号管理、多账号轮换或异常流量规避。
4. 不对第三方服务的计数机制进行规避型设计。

## 用户故事

1. 作为用户，我希望每个月自动运行一次听歌任务，而不是手动打开页面。
2. 作为用户，我希望配置单曲、多首歌曲或歌单，并决定循环模式。
3. 作为用户，我希望设置目标次数，例如 365 次，并由系统判断何时达到后自动停止。
4. 作为用户，我希望任务失败后可以知道失败在哪一步，例如登录失效、页面加载失败或播放器未启动。
5. 作为用户，我希望保留个人账号的安全边界，不把敏感信息写入仓库。
6. 作为用户，我希望任务完成后能收到飞书机器人通知。

## 需求拆解

### 1. 调度模块

- 支持使用 GitHub Actions 的 `schedule` 触发月度任务。
- 支持手动触发，便于调试。
- 支持并发控制，避免同一任务重复运行。

### 2. 配置模块

- 支持 YAML 或 JSON 配置文件。
- 支持单曲 URL、歌曲列表、歌单 URL、播放模式、目标次数、超时时长、重试策略、通知配置等参数。
- 单曲、多曲、歌单三类目标互斥，同一次任务只能选择其中一种；若配置多类目标，系统应按校验失败处理，而不是同时生效。
- 支持环境变量注入敏感信息。

建议配置示例：

```yaml
task_name: monthly-listening
schedule: "0 2 1 * *"
runner_mode: github_actions
targets:
  mode: songs
  songs:
    - name: song-a
      url: "https://music.163.com/#/song?id=123456"
    - name: song-b
      url: "https://music.163.com/#/song?id=654321"
target_effective_count: 365
max_run_hours: 12
retry:
  max_attempts: 3
  backoff_seconds: 60
  policy: rerun_whole_task
notify:
  feishu_webhook_secret_ref: FEISHU_BOT_WEBHOOK
```

### 3. 执行模块

- 启动浏览器自动化环境。
- 根据 `targets.mode` 打开目标单曲页面、歌曲列表或歌单页面。
- 检查登录态是否可用。
- 优先复用历史登录会话；若会话有效，则直接进入播放流程。
- 开始播放并监听播放状态。
- 在每次满足有效播放判定规则后更新系统计数。
- 达到阈值后停止播放并退出。

### 4. 状态与日志模块

- 持久化运行开始时间、当前歌曲或歌单、累计有效次数、失败原因。
- 输出结构化日志，便于定位页面变化或登录失效。
- 生成最终任务摘要。

### 5. 通知模块

- 支持飞书机器人 webhook 通知。
- 支持成功、失败两种通知模板。
- 失败通知必须包含具体失败原因，例如登录失效、页面加载失败、播放器未启动、播放中断、选择器失效或计数未更新。
- 失败通知应包含第几次重试失败，便于判断任务已失败在哪一轮。
- 成功通知应包含执行总耗时与播放完成次数。
- 支持发送任务摘要，例如开始时间、结束时间、目标次数、完成次数、失败原因。

### 6. 重试模块

- 失败后按“整任务重跑”策略执行，不从中断曲目或中断位置继续。
- 重跑前应清理本次运行的内存态和临时上下文，但保留历史日志与失败证据。
- 若达到最大重试次数仍失败，发送飞书失败通知并附最终失败原因。

### 7. 认证模块

- 优先使用持久化登录会话，目标是“首次登录后后续任务尽量无需人工干预”。
- 首次登录成功后，应持久化浏览器会话状态，以减少后续扫码频率。
- 若检测到会话失效，系统应进入登录恢复流程。
- 登录恢复流程优先级如下：
  1. 尝试复用已有 cookie / storage state
  2. 若失效，则触发二维码登录流程
  3. 若二维码登录不可用或连续超时，则尝试受控的账号密码登录
- 二维码登录流程要求：
  - 自动化系统抓取当前登录二维码
  - 通过飞书机器人向用户发送“需要登录”的通知
  - 通知中附可访问的临时二维码链接，用户点开即可查看并扫码
  - 临时二维码链接应使用一次性令牌或短时访问令牌保护，并设置过期时间
  - 用户扫码完成后，系统等待登录态建立并持久化新的会话
  - 二维码登录默认等待超时时间为 10 分钟，避免用户处理时间过短。
  - 若二维码登录超时，系统应自动刷新二维码并再次发送新的临时链接。
  - 二维码自动刷新最多允许重发 2 次；若重发后仍超时或达到重试上限，应记录明确失败原因并结束本次任务。
- 账号密码登录若启用，必须通过 GitHub Secrets 注入，不得写入仓库、日志或普通配置文件。
- 若账号密码登录失败，应回退到二维码登录流程再尝试 1 次，随后再按任务失败处理。

### 8. 安全模块

- 所有凭据只通过 GitHub Secrets 或本地安全存储注入。
- 日志中不得打印账号、密码、cookie、token。
- 会话文件不得直接提交到仓库，应存放在受控存储中，或通过安全方式注入运行环境。
- 默认优先使用二维码登录和会话复用，而不是依赖明文账号密码。
- 临时二维码链接应保存在受控临时存储中，并通过短时有效访问令牌限制访问范围。

## 计数口径定义

“本地计数”这个词容易引起误解，这里改为“系统有效计数”。

定义如下：

1. 计数由自动化系统自己维护，不读取或依赖平台显示的播放次数。
2. 一次“有效播放”由系统按预设规则判定，例如：
   - 成功进入目标歌曲页面或歌单中的目标曲目
   - 播放器进入 `playing` 状态
   - 当前曲目完整播放结束
   - 该次播放未被明确中断、报错、提前切换或跳过
3. 每满足一次有效播放规则，系统将 `effective_count + 1`。
4. 当 `effective_count >= 365` 时，任务停止。

说明：

- 这个计数是系统内部可审计计数，用于保证任务逻辑确定性。
- 它不是第三方平台计数，也不应该写成“确保平台展示次数达到 365”。
- 当前确定规则为“整首播完算 1 次”。

## 技术方案候选

### 方案 A：GitHub Hosted Actions + Playwright

优点：

- 无需自建运行器
- 调度和日志集成简单

缺点：

- 长时音频播放场景不稳定
- 浏览器会话持久化能力有限
- 登录态维护困难
- 风险和维护成本较高

结论：

用户希望使用 GitHub 自动化，因此该方案应保留为主路径；但文档中必须明确记录其稳定性和登录态维护风险。

### 方案 B：Self-hosted Runner + Playwright

优点：

- 更适合需要稳定浏览器环境和会话持久化的任务
- 便于调试和保留本地状态
- 可结合系统音频、桌面会话和持久 profile

缺点：

- 需要维护自有运行主机
- 安全边界和监控需要自己补齐

结论：

当前项目范围内不采用该方案。文档保留此项仅作为风险对比，不作为实施选项。

### 方案 C：本地任务计划程序 + Playwright

优点：

- 架构最简单
- 调试成本最低
- 适合纯个人使用

缺点：

- 缺少 GitHub Actions 的可见性和统一工作流
- 远程管理与日志归档能力较弱

结论：

当前项目范围内不采用该方案。文档保留此项仅作为风险对比，不作为实施选项。

## 建议架构

```text
config/
  listening-task.yaml

src/
  scheduler/
  runner/
  player/
  state/
  notifier/

logs/

docs/
  project-spec.md
```

逻辑流程：

1. 调度器触发任务。
2. 任务读取配置并检查互斥锁。
3. 配置校验器确认 `targets.mode` 仅启用一种目标类型。
4. 自动化运行器启动浏览器上下文。
5. 认证管理器检查已保存会话是否有效。
6. 若会话失效，则进入登录恢复流程，并通过飞书发送二维码登录提示。
7. 播放控制器按目标模式进入单曲、多曲列表或歌单并执行播放逻辑。
8. 状态模块按有效播放规则记录累计次数。
9. 达到阈值后终止任务并输出报告。
10. 若任务失败，则按整任务重跑策略进行重试。
11. 通知模块通过飞书机器人发送结果。

## 验收标准

### 文档阶段验收

1. 明确项目目标、非目标、风险和运行边界。
2. 明确项目仅使用 GitHub Actions，不采用 Self-hosted Runner 或本地任务方案。
3. 明确“系统有效计数”是验收口径，而非平台播放量。
4. 明确“整首播放完成”是有效计数规则。
5. 明确飞书只发送成功或失败通知，失败带具体原因。
6. 明确单曲、多曲、歌单三类目标互斥，只能生效一种。
7. 明确失败后按整任务重跑。
8. 明确认证策略为“优先复用会话，失效时二维码登录恢复”。
9. 明确多曲模式与歌单模式均按顺序播放。
10. 明确二维码通过临时链接交付，默认超时等待为 10 分钟。
11. 明确失败通知包含具体失败原因和失败发生的重试轮次。
12. 明确首次登录成功后持久化会话状态，二维码超时后自动刷新并再次发送。
13. 明确二维码最多重发 2 次，保留账号密码登录分支，成功通知附带耗时和完成次数。
14. 明确临时二维码链接采用短时访问令牌保护，账号密码登录失败后回退一次二维码登录。

### 后续开发阶段验收

1. 能按配置自动启动任务。
2. 能打开指定单曲、多曲列表或歌单并触发播放。
3. 能在整首播放完成后记录系统有效次数，并达到阈值后停止。
4. 能输出可读的执行日志和任务结果。
5. 能通过飞书机器人发送完成或失败通知。
6. 当配置了多个互斥目标类型时，能明确报配置错误并终止。
7. 任务失败后能按整任务重跑策略执行重试。
8. 会话有效时无需重复登录。
9. 会话失效时能触发二维码登录提醒，并在扫码成功后继续执行。
10. 二维码链接可通过飞书通知触达，且默认等待 10 分钟后超时。
11. 失败通知能显示具体失败原因和失败对应的重试次数。
12. 首次登录成功后能持久化会话状态；二维码超时后能自动刷新并再次发送。
13. 二维码最多重发 2 次；必要时可切换到账号密码登录；成功通知包含总耗时和完成次数。
14. 账号密码登录失败后能回退一次二维码登录；二维码链接具备时效性和访问控制。

## 已确认实现约束

1. 项目仅使用 GitHub Actions 作为自动化运行环境。
2. 临时二维码链接采用短时有效访问令牌保护。
3. 账号密码登录失败后，回退到二维码登录流程再尝试 1 次。

## 执行约束

1. 后续所有 `goal` 开发、排障、验证和任务执行，均应在已启用 `reverse-flow` skill 的前提下进行。
2. `reverse-flow` 在本项目中的用途不是样本逆向，而是将浏览器自动化、登录恢复、会话持久化、页面行为分析和失败证据收集纳入统一的证据驱动流程。
3. 后续实现阶段的输出仍应保留以下结构：
   - 当前阶段 / Current phase
   - 已验证事实 / Verified facts
   - 关键证据 / Key evidence
   - 推断与置信度 / Inference and confidence
   - 风险/漏洞候选 / Risk or vulnerability candidates
   - 建议下一步 / Suggested next steps
4. 任何影响登录、计数、播放完成判定、二维码分发和 GitHub Actions 会话行为的修改，都应附带证据和回归验证结果。

## 配置 Schema 草案

建议采用单一配置文件 `config/listening-task.yaml`，字段定义如下：

```yaml
task_name: string
schedule: cron_string
runner_mode: github_actions
target_effective_count: integer
max_run_hours: integer

targets:
  mode: song | songs | playlist
  song:
    name: string
    url: string
  songs:
    - name: string
      url: string
  playlist:
    name: string
    url: string

playback:
  order: sequential
  loop_mode: single_repeat | list_repeat | playlist_repeat
  completion_rule: full_track_finished

retry:
  max_attempts: integer
  backoff_seconds: integer
  policy: rerun_whole_task

auth:
  prefer_session_reuse: true
  qr_wait_timeout_minutes: 10
  qr_refresh_limit: 2
  fallback_to_password_login: true
  fallback_to_qr_after_password_failure: true
  session_secret_ref: string
  username_secret_ref: string
  password_secret_ref: string

notify:
  feishu_webhook_secret_ref: string
  send_success: true
  send_failure: true
  include_duration: true
  include_effective_count: true

artifacts:
  save_logs: true
  save_screenshots: true
  save_trace_on_failure: true
```

### 配置校验规则

1. `runner_mode` 必须固定为 `github_actions`。
2. `targets.mode` 必须且只能是 `song`、`songs`、`playlist` 之一。
3. `targets.mode = song` 时，必须提供且只提供 `targets.song`。
4. `targets.mode = songs` 时，必须提供非空 `targets.songs`。
5. `targets.mode = playlist` 时，必须提供且只提供 `targets.playlist`。
6. `playback.order` 当前仅允许 `sequential`。
7. `playback.completion_rule` 当前仅允许 `full_track_finished`。
8. `retry.policy` 当前仅允许 `rerun_whole_task`。
9. 开启账号密码登录回退时，必须配置对应 secrets 引用。

## 状态机设计

### 顶层任务状态

```text
IDLE
  -> VALIDATING_CONFIG
  -> STARTING_RUNNER
  -> RESTORING_SESSION
  -> AUTHENTICATING
  -> PREPARING_PLAYBACK
  -> PLAYING
  -> COUNTING
  -> COMPLETED
  -> FAILED
  -> RETRYING
```

### 状态说明

1. `IDLE`
   - 等待 GitHub Actions 定时或手动触发。
2. `VALIDATING_CONFIG`
   - 校验配置完整性、目标互斥关系和 secrets 引用。
3. `STARTING_RUNNER`
   - 启动 Playwright 浏览器上下文和运行目录。
4. `RESTORING_SESSION`
   - 读取持久化会话并验证当前登录态。
5. `AUTHENTICATING`
   - 登录态失效时进入认证恢复，路径包括二维码登录与账号密码登录。
6. `PREPARING_PLAYBACK`
   - 按目标模式进入单曲、多曲或歌单播放入口。
7. `PLAYING`
   - 监听播放状态、当前曲目、播放进度和异常事件。
8. `COUNTING`
   - 在曲目完整播放结束时执行 `effective_count + 1` 并判断是否达到 365。
9. `COMPLETED`
   - 写入最终状态、上传 artifacts、发送飞书成功通知。
10. `FAILED`
   - 记录失败证据、判断是否可重试。
11. `RETRYING`
   - 清理运行态并按整任务重跑策略重新进入 `STARTING_RUNNER`。

### 关键状态转移

1. `RESTORING_SESSION -> PREPARING_PLAYBACK`
   - 条件：会话有效。
2. `RESTORING_SESSION -> AUTHENTICATING`
   - 条件：会话失效或缺失。
3. `AUTHENTICATING -> PREPARING_PLAYBACK`
   - 条件：任一登录恢复路径成功。
4. `AUTHENTICATING -> FAILED`
   - 条件：二维码和账号密码路径均失败。
5. `PLAYING -> COUNTING`
   - 条件：检测到当前曲目完整播放结束。
6. `COUNTING -> PLAYING`
   - 条件：累计次数未达目标，继续下一首或下一轮。
7. `COUNTING -> COMPLETED`
   - 条件：`effective_count >= target_effective_count`。
8. `FAILED -> RETRYING`
   - 条件：当前失败次数小于 `retry.max_attempts`。
9. `FAILED -> COMPLETED`
   - 不允许。

## 模块边界与接口草案

### 1. ConfigLoader

职责：
- 读取 YAML 配置
- 校验 schema
- 解析 secrets 引用

建议接口：

```ts
type AppConfig = { /* omitted */ }

function loadConfig(configPath: string): Promise<AppConfig>
function validateConfig(config: AppConfig): void
```

### 2. SessionManager

职责：
- 加载和保存 Playwright storage state
- 校验登录态是否有效
- 清理过期会话

建议接口：

```ts
type SessionCheckResult = {
  valid: boolean
  reason?: string
}

function restoreSession(context: BrowserContext): Promise<SessionCheckResult>
function persistSession(context: BrowserContext): Promise<void>
function clearSession(): Promise<void>
```

### 3. AuthManager

职责：
- 执行二维码登录流程
- 执行账号密码登录流程
- 处理认证失败后的回退逻辑

建议接口：

```ts
type AuthResult = {
  success: boolean
  method: "session" | "qr" | "password"
  reason?: string
}

function authenticate(context: BrowserContext): Promise<AuthResult>
function startQrLogin(context: BrowserContext): Promise<{ link: string }>
function loginWithPassword(context: BrowserContext): Promise<AuthResult>
```

### 4. TargetResolver

职责：
- 根据 `targets.mode` 生成播放队列
- 规范化单曲、多曲、歌单输入

建议接口：

```ts
type TrackTarget = {
  name: string
  url: string
  source: "song" | "songs" | "playlist"
}

function resolveTargets(config: AppConfig): Promise<TrackTarget[]>
```

### 5. PlayerController

职责：
- 打开页面
- 触发播放
- 监听曲目切换和播放结束
- 为计数器提供完成事件

建议接口：

```ts
type PlaybackEvent =
  | { type: "track_started"; track: TrackTarget }
  | { type: "track_finished"; track: TrackTarget }
  | { type: "playback_error"; reason: string }

function playQueue(
  context: BrowserContext,
  queue: TrackTarget[],
  onEvent: (event: PlaybackEvent) => Promise<void>
): Promise<void>
```

### 6. CounterService

职责：
- 维护 `effective_count`
- 判断停止条件
- 落盘计数状态

建议接口：

```ts
type CounterState = {
  effectiveCount: number
  targetCount: number
}

function loadCounterState(): Promise<CounterState>
function incrementCounter(track: TrackTarget): Promise<CounterState>
function isTargetReached(state: CounterState): boolean
```

### 7. Notifier

职责：
- 发送飞书成功/失败通知
- 发送二维码登录提示

建议接口：

```ts
function sendSuccess(payload: {
  durationMs: number
  effectiveCount: number
}): Promise<void>

function sendFailure(payload: {
  attempt: number
  reason: string
}): Promise<void>

function sendQrLoginLink(payload: {
  link: string
  expiresInMinutes: number
}): Promise<void>
```

### 8. EvidenceCollector

职责：
- 保存日志、截图、trace、页面 HTML 片段
- 生成失败证据索引

建议接口：

```ts
function captureFailureEvidence(reason: string): Promise<void>
function writeRunSummary(): Promise<void>
```

## GitHub Actions 工作流草图

建议工作流文件：`.github/workflows/monthly-listening.yml`

```yaml
name: monthly-listening

on:
  schedule:
    - cron: "0 2 1 * *"
  workflow_dispatch:

concurrency:
  group: monthly-listening
  cancel-in-progress: false

jobs:
  run-listening-task:
    runs-on: ubuntu-latest
    timeout-minutes: 720
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Restore session artifact
        run: npm run session:restore

      - name: Run task
        env:
          FEISHU_BOT_WEBHOOK: ${{ secrets.FEISHU_BOT_WEBHOOK }}
          NETEASE_USERNAME: ${{ secrets.NETEASE_USERNAME }}
          NETEASE_PASSWORD: ${{ secrets.NETEASE_PASSWORD }}
          SESSION_SECRET: ${{ secrets.NETEASE_SESSION_SECRET }}
        run: npm run task:monthly

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: monthly-listening-logs
          path: artifacts/
```

### 工作流注意点

1. 需要设计会话恢复与会话保存步骤，避免每次都重新登录。
2. 二维码临时链接如果依赖外部临时存储，需要额外的发布与清理步骤。
3. `timeout-minutes` 需要和 `max_run_hours` 配套验证。
4. 失败时必须确保 artifacts 上传，便于 `reverse-flow` 模式下回看证据。

## 证据与产物规范

每次运行建议至少产出以下内容：

1. `artifacts/logs/run.log`
2. `artifacts/state/counter-state.json`
3. `artifacts/state/session-metadata.json`
4. `artifacts/screenshots/` 下的关键页面截图
5. `artifacts/reports/run-summary.md`
6. 失败时的 `artifacts/trace/` 或页面源码快照

失败证据最少应覆盖：

1. 失败时间
2. 失败阶段
3. 当前目标对象
4. 当前重试次数
5. 页面关键截图
6. 关键 DOM 或播放器状态

## 开发阶段建议

1. M1: 项目脚手架与配置校验
   - 初始化 Node/Playwright 项目
   - 实现配置加载与 schema 校验
2. M2: 会话恢复与认证恢复
   - 实现 storage state 持久化
   - 实现二维码链接通知
   - 实现账号密码回退登录
3. M3: 播放队列与计数器
   - 实现单曲、多曲、歌单三种目标解析
   - 实现整首完成计数
4. M4: GitHub Actions 集成
   - 接入 workflow
   - 接入 artifacts 上传
5. M5: 失败证据与通知完善
   - 完善 trace、截图、失败摘要
   - 完善飞书成功/失败通知模板

## 建议下一步 / Suggested next steps

1. 这份文档已经可以作为后续 `goal` 开发基线使用。
2. 如果继续推进，下一步应新建正式开发目标，并在 `reverse-flow` 模式下按 M1 到 M5 分阶段实施。
