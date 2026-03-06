import * as fs from 'fs';
import fs__default from 'fs';
import * as path from 'path';
import path__default, { join, resolve } from 'path';
import require$$0 from 'zlib';
import require$$0$1 from 'crypto';

var EventType = /* @__PURE__ */ ((EventType2) => {
  EventType2["META"] = "meta_event";
  EventType2["REQUEST"] = "request";
  EventType2["NOTICE"] = "notice";
  EventType2["MESSAGE"] = "message";
  EventType2["MESSAGE_SENT"] = "message_sent";
  return EventType2;
})(EventType || {});

const DEFAULT_CONFIG = {
  enabled: true,
  debug: false,
  commandPrefix: "#steam",
  cooldownSeconds: 1,
  groupConfigs: {},
  // TODO: 在这里添加你的默认配置值
  pollingIntervalSeconds: 60,
  steamApiKey: "",
  adminUsers: [],
  // 默认管理员用户
  notifyStatusTypes: ["online", "offline", "ingame", "outgame", "inAfk", "outAfk", "quitGame", "switchGame"]
};
function buildConfigSchema(ctx) {
  const pluginName = ctx.pluginName;
  const webuiUrl = `/plugin/${pluginName}/page/dashboard`;
  return ctx.NapCatConfig.combine(
    // 跳转到管理页面按钮
    ctx.NapCatConfig.html(`
            <div style="margin-bottom: 16px;">
                <a href="${webuiUrl}"
                   target="_blank"
                   style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #FB7299; color: white; border-radius: 8px; text-decoration: none; font-weight: 500; transition: opacity 0.2s;"
                   onmouseover="this.style.opacity='0.9'"
                   onmouseout="this.style.opacity='1'">
                    <span>📊</span>
                    <span>打开 WebUI 管理页面</span>
                </a>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">在独立页面中管理 Steam 绑定和查看状态</p>
            </div>
        `),
    // 插件信息头部
    ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #FB7299; border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">Steam 状态监听</h3>
                <p style="margin: 0; font-size: 13px; opacity: 0.85;">Steam 在线状态监听插件，支持监控 Steam 用户状态并发送通知</p>
            </div>
        `),
    // 全局开关
    // ctx.NapCatConfig.boolean( 'enabled', '启用插件', true, '是否启用此插件的功能' ),
    // 调试模式
    // ctx.NapCatConfig.boolean( 'debug', '调试模式', false, '启用后将输出详细的调试日志' ),
    // 冷却时间
    ctx.NapCatConfig.number("cooldownSeconds", "冷却时间（秒）", 1, "同一命令请求冷却时间，0 表示不限制"),
    // 轮询间隔
    ctx.NapCatConfig.number("pollingIntervalSeconds", "Steam轮询间隔（秒）", 60, "Steam状态检查的间隔时间（秒），默认为60秒"),
    // Steam API Key
    ctx.NapCatConfig.text(
      "steamApiKey",
      "Steam API KEY",
      "",
      "用于请求 STEAM 访问的 API 秘钥",
      true
      // reactive: true，当在WebUI中修改时触发配置变更回调
    ),
    // 管理员用户列表
    ctx.NapCatConfig.text(
      "adminUsers",
      "插件管理员用户",
      "",
      "插件管理员QQ号列表，多个QQ号用英文逗号分隔"
    ),
    // 状态推送设置
    ctx.NapCatConfig.multiSelect(
      "notifyStatusTypes",
      "状态推送设置",
      [
        { label: "上线", value: "online" },
        { label: "离线", value: "offline" },
        { label: "开始游戏", value: "ingame" },
        { label: "结束游戏", value: "outgame" },
        { label: "开始挂机", value: "inAfk" },
        { label: "结束挂机", value: "outAfk" },
        { label: "游戏下线", value: "quitGame" },
        { label: "切换游戏", value: "switchgame" }
      ],
      ["online", "offline", "ingame", "outgame", "inAfk", "outAfk", "quitGame", "switchGame"],
      "选择要推送的 Steam 状态变化类型，默认全部推送"
    )
  );
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function sanitizeConfig(raw) {
  if (!isObject(raw)) return { ...DEFAULT_CONFIG, groupConfigs: {} };
  const out = { ...DEFAULT_CONFIG, groupConfigs: {} };
  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  if (typeof raw.debug === "boolean") out.debug = raw.debug;
  if (typeof raw.commandPrefix === "string") out.commandPrefix = raw.commandPrefix;
  if (typeof raw.cooldownSeconds === "number") out.cooldownSeconds = raw.cooldownSeconds;
  if (typeof raw.steamApiKey === "string") out.steamApiKey = raw.steamApiKey;
  if (typeof raw.pollingIntervalSeconds === "number") out.pollingIntervalSeconds = raw.pollingIntervalSeconds;
  if (typeof raw.adminUsers === "string") {
    out.adminUsers = raw.adminUsers.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
  } else if (Array.isArray(raw.adminUsers)) {
    out.adminUsers = raw.adminUsers.map((id) => String(id)).filter((id) => id.length > 0);
  } else if (raw.adminUsers === void 0 || raw.adminUsers === null) {
    out.adminUsers = DEFAULT_CONFIG.adminUsers || [];
  }
  const validStatusTypes = ["online", "offline", "ingame", "outgame", "inAfk", "outAfk", "quitGame"];
  if (Array.isArray(raw.notifyStatusTypes)) {
    out.notifyStatusTypes = raw.notifyStatusTypes.filter((type) => typeof type === "string").filter((type) => validStatusTypes.includes(type));
    if (out.notifyStatusTypes.length === 0) {
      out.notifyStatusTypes = [...DEFAULT_CONFIG.notifyStatusTypes];
    }
  } else {
    out.notifyStatusTypes = [...DEFAULT_CONFIG.notifyStatusTypes];
  }
  if (isObject(raw.groupConfigs)) {
    for (const [groupId, groupConfig] of Object.entries(raw.groupConfigs)) {
      if (isObject(groupConfig)) {
        const cfg = {};
        if (typeof groupConfig.enabled === "boolean") cfg.enabled = groupConfig.enabled;
        out.groupConfigs[groupId] = cfg;
      }
    }
  }
  return out;
}
class PluginState {
  /** NapCat 插件上下文（init 后可用） */
  _ctx = null;
  /** 插件配置 */
  config = { ...DEFAULT_CONFIG };
  /** 插件启动时间戳 */
  startTime = 0;
  /** 机器人自身 QQ 号 */
  selfId = "";
  /** 活跃的定时器 Map: jobId -> NodeJS.Timeout */
  timers = /* @__PURE__ */ new Map();
  /** 运行时统计 */
  stats = {
    processed: 0,
    todayProcessed: 0,
    lastUpdateDay: (/* @__PURE__ */ new Date()).toDateString()
  };
  /** 获取上下文（确保已初始化） */
  get ctx() {
    if (!this._ctx) throw new Error("PluginState 尚未初始化，请先调用 init()");
    return this._ctx;
  }
  /** 获取日志器的快捷方式 */
  get logger() {
    return this.ctx.logger;
  }
  // ==================== 生命周期 ====================
  /**
   * 初始化（在 plugin_init 中调用）
   */
  init(ctx) {
    this._ctx = ctx;
    this.startTime = Date.now();
    this.loadConfig();
    this.ensureDataDir();
    this.fetchSelfId();
  }
  /**
   * 获取机器人自身 QQ 号（异步，init 时自动调用）
   */
  async fetchSelfId() {
    try {
      const res = await this.ctx.actions.call(
        "get_login_info",
        {},
        this.ctx.adapterName,
        this.ctx.pluginManager.config
      );
      if (res?.user_id) {
        this.selfId = String(res.user_id);
        this.logger.debug("(｡·ω·｡) 机器人 QQ: " + this.selfId);
      }
    } catch (e) {
      this.logger.warn("(；′⌒`) 获取机器人 QQ 号失败:", e);
    }
  }
  /**
   * 清理（在 plugin_cleanup 中调用）
   */
  cleanup() {
    for (const [jobId, timer] of this.timers) {
      clearInterval(timer);
      this.logger.debug(`(｡-ω-) 清理定时器: ${jobId}`);
    }
    this.timers.clear();
    this.saveConfig();
    this._ctx = null;
  }
  // ==================== 数据目录 ====================
  /** 确保数据目录存在 */
  ensureDataDir() {
    const dataPath = this.ctx.dataPath;
    if (!fs__default.existsSync(dataPath)) {
      fs__default.mkdirSync(dataPath, { recursive: true });
    }
  }
  /** 获取数据文件完整路径 */
  getDataFilePath(filename) {
    return path__default.join(this.ctx.dataPath, filename);
  }
  // ==================== 通用数据文件读写 ====================
  /**
   * 读取 JSON 数据文件
   * 常用于订阅数据、定时任务配置、推送历史等持久化数据
   * @param filename 数据文件名（如 'subscriptions.json'）
   * @param defaultValue 文件不存在或解析失败时的默认值
   */
  loadDataFile(filename, defaultValue) {
    const filePath = this.getDataFilePath(filename);
    try {
      if (fs__default.existsSync(filePath)) {
        return JSON.parse(fs__default.readFileSync(filePath, "utf-8"));
      }
    } catch (e) {
      this.logger.warn("(；′⌒`) 读取数据文件 " + filename + " 失败:", e);
    }
    return defaultValue;
  }
  /**
   * 保存 JSON 数据文件
   * @param filename 数据文件名
   * @param data 要保存的数据
   * @param space json数据保存的的缩进
   */
  saveDataFile(filename, data, space = 0) {
    const filePath = this.getDataFilePath(filename);
    try {
      fs__default.writeFileSync(filePath, JSON.stringify(data, null, space), "utf-8");
    } catch (e) {
      this.logger.error("(╥﹏╥) 保存数据文件 " + filename + " 失败:", e);
    }
  }
  // ==================== 配置管理 ====================
  /**
   * 从磁盘加载配置
   */
  loadConfig() {
    const configPath = this.ctx.configPath;
    try {
      if (configPath && fs__default.existsSync(configPath)) {
        const raw = JSON.parse(fs__default.readFileSync(configPath, "utf-8"));
        this.config = sanitizeConfig(raw);
        if (isObject(raw) && isObject(raw.stats)) {
          Object.assign(this.stats, raw.stats);
        }
        this.ctx.logger.debug("已加载本地配置");
      } else {
        this.config = { ...DEFAULT_CONFIG, groupConfigs: {} };
        this.saveConfig();
        this.ctx.logger.debug("配置文件不存在，已创建默认配置");
      }
    } catch (error) {
      this.ctx.logger.error("加载配置失败，使用默认配置:", error);
      this.config = { ...DEFAULT_CONFIG, groupConfigs: {} };
    }
  }
  /**
   * 保存配置到磁盘
   */
  saveConfig() {
    if (!this._ctx) return;
    const configPath = this._ctx.configPath;
    try {
      const configDir = path__default.dirname(configPath);
      if (!fs__default.existsSync(configDir)) {
        fs__default.mkdirSync(configDir, { recursive: true });
      }
      const data = { ...this.config, stats: this.stats };
      fs__default.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      this._ctx.logger.error("保存配置失败:", error);
    }
  }
  /**
   * 合并更新配置
   */
  updateConfig(partial) {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }
  /**
   * 完整替换配置
   */
  replaceConfig(config) {
    this.config = sanitizeConfig(config);
    this.saveConfig();
  }
  /**
   * 更新指定群的配置
   */
  updateGroupConfig(groupId, config) {
    this.config.groupConfigs[groupId] = {
      ...this.config.groupConfigs[groupId],
      ...config
    };
    this.saveConfig();
  }
  /**
   * 检查群是否启用（默认启用，除非明确设置为 false）
   */
  isGroupEnabled(groupId) {
    return this.config.groupConfigs[groupId]?.enabled === true;
  }
  /**
   * 检查用户是否为管理员
   */
  isUserAdmin(userId) {
    const adminUsers = this.config.adminUsers || [];
    return adminUsers.includes(userId);
  }
  // ==================== 统计 ====================
  /**
   * 增加处理计数
   */
  incrementProcessed() {
    const today = (/* @__PURE__ */ new Date()).toDateString();
    if (this.stats.lastUpdateDay !== today) {
      this.stats.todayProcessed = 0;
      this.stats.lastUpdateDay = today;
    }
    this.stats.todayProcessed++;
    this.stats.processed++;
  }
  // ==================== 工具方法 ====================
  /** 获取运行时长（毫秒） */
  getUptime() {
    return Date.now() - this.startTime;
  }
  /** 获取格式化的运行时长 */
  getUptimeFormatted() {
    const ms = this.getUptime();
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}天${h % 24}小时`;
    if (h > 0) return `${h}小时${m % 60}分钟`;
    if (m > 0) return `${m}分钟${s % 60}秒`;
    return `${s}秒`;
  }
}
const pluginState = new PluginState();

const cooldownMap = /* @__PURE__ */ new Map();
function getCooldownRemaining(groupId, command) {
  const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
  if (cdSeconds <= 0) return 0;
  const key = `${groupId}:${command}`;
  const expireTime = cooldownMap.get(key);
  if (!expireTime) return 0;
  const remaining = Math.ceil((expireTime - Date.now()) / 1e3);
  if (remaining <= 0) {
    cooldownMap.delete(key);
    return 0;
  }
  return remaining;
}
function setCooldown(groupId, command) {
  const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
  if (cdSeconds <= 0) return;
  cooldownMap.set(`${groupId}:${command}`, Date.now() + cdSeconds * 1e3);
}
async function sendReply(ctx, event, message) {
  try {
    const params = {
      message,
      message_type: event.message_type,
      ...event.message_type === "group" && event.group_id ? { group_id: String(event.group_id) } : {},
      ...event.message_type === "private" && event.user_id ? { user_id: String(event.user_id) } : {}
    };
    await ctx.actions.call("send_msg", params, ctx.adapterName, ctx.pluginManager.config);
    return true;
  } catch (error) {
    pluginState.logger.error("发送消息失败:", error);
    return false;
  }
}
async function sendGroupMessage(ctx, groupId, message) {
  try {
    const params = {
      message,
      group_id: String(groupId)
    };
    await ctx.actions.call("send_group_msg", params, ctx.adapterName, ctx.pluginManager.config);
    return true;
  } catch (error) {
    pluginState.logger.error("发送群消息失败:", error);
    return false;
  }
}
async function sendPrivateMessage(ctx, userId, message) {
  try {
    const params = {
      message,
      user_id: String(userId)
    };
    await ctx.actions.call("send_private_msg", params, ctx.adapterName, ctx.pluginManager.config);
    return true;
  } catch (error) {
    pluginState.logger.error("发送私聊消息失败:", error);
    return false;
  }
}
function createImageMessage(file) {
  return {
    type: "image",
    data: { file }
  };
}

async function handleHelp(ctx, event, args) {
  const userId = String(event.user_id);
  const isPrivateMessage = event.message_type === "private";
  const isAdmin = isPrivateMessage && pluginState.isUserAdmin(userId);
  const assetsDir = join(ctx.dataPath, "..", "assets");
  const imageFileName = isAdmin ? "admin-help.png" : "user-help.png";
  const imagePath = resolve(assetsDir, imageFileName);
  if (fs__default.existsSync(imagePath)) {
    const imageMessage = createImageMessage(imagePath);
    await sendReply(ctx, event, imageMessage);
  } else {
    await sendTextHelp(ctx, event, isAdmin);
  }
}
async function sendTextHelp(ctx, event, isAdmin) {
  const prefix = pluginState.config.commandPrefix;
  const helpLines = [
    `[= 插件帮助 =]`,
    `${prefix} bind <steam-id> [自定义用户昵称] - 绑定Steam用户`,
    `${prefix} bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ... - 批量绑定Steam用户`,
    `${prefix} list - 获取当前群组/用户已绑定的Steam数据`,
    `${prefix} remove <steam-id> - 移除指定的Steam绑定数据`,
    `${prefix} reset - 清空当前群组/用户的steam绑定数据`,
    "",
    "[= 辅助指令 =]",
    `${prefix} help - 显示帮助信息`,
    `${prefix} search <Steam昵称或链接> - 查询Steam ID64`,
    "",
    "[= 如何获取 Steam ID =]",
    "方法一：通过好友列表",
    "1. 打开 Steam 客户端，进入好友列表",
    "2. 右键点击要查询的好友 → 查看个人资料",
    "3. 在打开的页面中，查看浏览器地址栏：",
    "   • /id/ 后面的英文是自定义ID（如：/id/xxx）",
    "   • /profiles/ 后面的17位数字是 Steam ID64",
    "",
    "方法二：通过个人资料链接",
    `• 直接使用 ${prefix} search <自定义ID> 查询`,
    `• 或使用 ${prefix} search <完整Steam个人资料链接>`
  ];
  if (isAdmin) {
    helpLines.push("");
    helpLines.push("[= 管理员指令 =]");
    helpLines.push(`${prefix} polling - 手动触发一次Steam状态轮询（仅私聊可用）`);
    helpLines.push(`${prefix} group add <群号> - 将群聊添加到白名单（仅私聊可用）`);
    helpLines.push(`${prefix} group remove <群号> - 从白名单移除群聊（仅私聊可用）`);
    helpLines.push(`${prefix} group list - 查看已管理的群组列表（仅私聊可用）`);
    helpLines.push(`${prefix} admin list - 查看管理员列表（仅私聊可用）`);
    helpLines.push(`${prefix} admin add <QQ号> - 添加管理员（仅私聊可用）`);
    helpLines.push(`${prefix} admin remove <QQ号> - 移除管理员（仅私聊可用）`);
  }
  await sendReply(ctx, event, helpLines.join("\n"));
}

class SteamService {
  steamApiBaseUrl = "http://api.steampowered.com";
  /**
   * 获取玩家摘要信息
   * @param steamIds 一个或多个 Steam ID（用逗号分隔）
   * @returns 玩家摘要信息列表
   */
  async getPlayerSummaries(steamIds) {
    try {
      const steamIdsString = Array.isArray(steamIds) ? steamIds.join(",") : steamIds;
      if (!pluginState.config.steamApiKey) {
        throw new Error("Steam API Key 未配置");
      }
      const params = new URLSearchParams({
        key: pluginState.config.steamApiKey,
        steamids: steamIdsString,
        format: "json"
      });
      const response = await fetch(`${this.steamApiBaseUrl}/ISteamUser/GetPlayerSummaries/v0002/?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      pluginState.logger.debug(`Steam API 请求成功，返回 ${data.response.players.length} 个玩家信息`);
      return data.response.players;
    } catch (error) {
      let errorMessage = "获取 Steam 玩家信息失败";
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "无法连接到 Steam API 服务器";
      } else if (error.message && error.message.includes("HTTP")) {
        const match = error.message.match(/HTTP (\d+):/);
        if (match) {
          const status = parseInt(match[1]);
          if (status === 403 || status === 401) {
            errorMessage = "Steam API Key 无效或无权限访问";
          } else {
            errorMessage = `Steam API 错误: ${status} - ${error.message}`;
          }
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = `请求 Steam API 时发生错误: ${error.message}`;
      }
      pluginState.logger.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }
  /**
   * 获取单个玩家的摘要信息
   * @param steamId 单个 Steam ID
   * @returns 玩家摘要信息
   */
  async getPlayerSummary(steamId) {
    try {
      const players = await this.getPlayerSummaries(steamId);
      return players.length > 0 ? players[0] : null;
    } catch (error) {
      pluginState.logger.error(`获取玩家 ${steamId} 信息失败:`, error);
      return null;
    }
  }
  /**
   * 验证 Steam API Key 是否有效
   * @returns 验证结果
   */
  async validateApiKey() {
    try {
      if (!pluginState.config.steamApiKey) {
        return false;
      }
      const players = await this.getPlayerSummaries("76561197960435530");
      return players.length > 0;
    } catch (error) {
      pluginState.logger.warn("Steam API Key 验证失败:", error);
      return false;
    }
  }
  /**
   * 格式化玩家状态为可读文本
   * @param state 玩家状态码
   * @returns 可读状态文本
   */
  formatPlayerState(state) {
    const states = {
      0: "离线",
      1: "在线",
      2: "忙碌",
      3: "离开",
      4: "休眠",
      5: "寻求交易",
      6: "寻求游戏"
    };
    return states[state] || "未知状态";
  }
  /**
   * 格式化可见性状态为可读文本
   * @param state 可见性状态码
   * @returns 可读状态文本
   */
  formatVisibilityState(state) {
    const states = {
      1: "不可见",
      3: "公开"
    };
    return states[state] || `未知状态 (${state})`;
  }
  /**
   * 通过Steam API查询自定义ID对应的Steam ID64
   * @param steamId 输入的Steam自定义ID
   * @returns Steam ID64字符串
   */
  async getSteamID64(steamId) {
    try {
      if (!pluginState.config.steamApiKey) {
        throw new Error("Steam API Key 未配置");
      }
      pluginState.logger.debug(`正在通过Steam API查询自定义ID: ${steamId}`);
      const params = new URLSearchParams({
        key: pluginState.config.steamApiKey,
        vanityurl: steamId,
        format: "json"
      });
      const response = await fetch(`${this.steamApiBaseUrl}/ISteamUser/ResolveVanityURL/v0001/?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.response.success === 1 && data.response.steamid) {
        pluginState.logger.debug(`成功获取Steam ID64: ${data.response.steamid} for custom ID: ${steamId}`);
        return data.response.steamid;
      } else {
        const errorCode = data.response.success;
        const errorMessage = data.response.message || "未知错误";
        pluginState.logger.warn(`Steam API查询失败: 错误码 ${errorCode}, 信息: ${errorMessage}`);
        return null;
      }
    } catch (error) {
      let errorMessage = `查询Steam ID64失败: ${steamId}`;
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "无法连接到Steam API服务器";
      } else if (error.message && error.message.includes("HTTP")) {
        const match = error.message.match(/HTTP (\d+):/);
        if (match) {
          const status = parseInt(match[1]);
          if (status === 403 || status === 401) {
            errorMessage = "Steam API Key 无效或无权限访问";
          } else {
            errorMessage = `Steam API错误: ${status} - ${error.message}`;
          }
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = `请求Steam API时发生错误: ${error.message}`;
      }
      pluginState.logger.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }
}
const steamService = new SteamService();

async function handleSteamSearch(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-search");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  if (args.length < 2) {
    await sendReply(ctx, event, "用法: #steam-search <STEAM昵称>");
    return;
  }
  const steamProfileUrl = args[1];
  try {
    let steamIdInput = steamProfileUrl;
    if (steamProfileUrl.startsWith("http")) {
      const url = new URL(steamProfileUrl);
      if (url.hostname.includes("steamcommunity.com")) {
        const pathParts = url.pathname.split("/");
        const idIndex = pathParts.indexOf("profiles") + 1;
        if (idIndex > 0 && idIndex < pathParts.length) {
          steamIdInput = pathParts[idIndex];
        } else {
          const idIndex2 = pathParts.indexOf("id") + 1;
          if (idIndex2 > 0 && idIndex2 < pathParts.length) {
            steamIdInput = pathParts[idIndex2];
          }
        }
      }
    }
    if (!steamIdInput) {
      await sendReply(ctx, event, "错误 Steam 昵称格式，请检查输入。");
      return;
    }
    const steamID64 = await steamService.getSteamID64(steamIdInput);
    if (steamID64) {
      await sendReply(ctx, event, `用户 ${steamIdInput} 的 Steam ID64: ${steamID64}`);
    } else {
      await sendReply(ctx, event, "无法获取Steam ID64，请检查输入的链接或ID是否正确。");
    }
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("查询Steam ID时出错:", error);
    await sendReply(ctx, event, `查询失败: ${error.message}`);
  }
  if (messageType === "group" && groupId) setCooldown(groupId, "steam-search");
}

const STEAM_BIND_DATA_FILE = "steam-bind-data.json";
const BACKUP_DIR = "../backup";
const MAX_BACKUP_FILES = 5;
function loadSteamBindData() {
  try {
    const data = pluginState.loadDataFile(STEAM_BIND_DATA_FILE, []);
    if (data.length === 0) {
      const backupData = restoreSteamBindDataFromBackup();
      if (backupData !== null) {
        saveSteamBindData(backupData);
        pluginState.logger.info("已从备份恢复 Steam 绑定数据");
        return backupData;
      }
    }
    return data;
  } catch (error) {
    pluginState.logger.warn("从主文件加载 Steam 绑定数据失败，尝试从备份恢复:", error);
    const backupData = restoreSteamBindDataFromBackup();
    if (backupData !== null) {
      saveSteamBindData(backupData);
      pluginState.logger.info("已从备份恢复 Steam 绑定数据");
      return backupData;
    }
    pluginState.logger.error("从备份恢复 Steam 绑定数据也失败，返回空数组");
    return [];
  }
}
function saveSteamBindData(data) {
  if (data === null || data === void 0) {
    pluginState.logger.warn("尝试保存空的 Steam 绑定数据，已阻止");
    return;
  }
  if (!Array.isArray(data)) {
    pluginState.logger.error("Steam 绑定数据格式错误，不是数组格式，已阻止保存");
    return;
  }
  pluginState.saveDataFile(STEAM_BIND_DATA_FILE, data);
}
function findSteamBindItem(steamId) {
  const data = loadSteamBindData();
  return data.find((item) => item.steamId === steamId);
}
function updateSteamBindItem(bindItem) {
  const data = loadSteamBindData();
  const index = data.findIndex((item) => item.steamId === bindItem.steamId);
  if (index !== -1) {
    const existingItem = data[index];
    const updatedItem = { ...existingItem, ...bindItem };
    if (bindItem.from && existingItem.from) {
      const mergedFrom = [...existingItem.from];
      for (const newFrom of bindItem.from) {
        const existingIndex = mergedFrom.findIndex(
          (existingFrom) => existingFrom.id === newFrom.id && existingFrom.type === newFrom.type
        );
        if (existingIndex !== -1) {
          mergedFrom[existingIndex] = { ...mergedFrom[existingIndex], ...newFrom };
        } else {
          mergedFrom.push(newFrom);
        }
      }
      updatedItem.from = mergedFrom;
    } else if (bindItem.from && !existingItem.from) {
      updatedItem.from = bindItem.from;
    }
    data[index] = updatedItem;
  } else {
    data.push(bindItem);
  }
  saveSteamBindData(data);
  backupSteamBindData();
}
function findSteamBindItemsByFrom(fromId, fromType) {
  const data = loadSteamBindData();
  return data.filter((item) => {
    if (!item.from) return false;
    return item.from.some((fromInfo) => fromInfo.id === fromId && fromInfo.type === fromType);
  });
}
function removeSteamBindItemFrom(fromId, fromType) {
  const data = loadSteamBindData();
  const updatedData = data.map((item) => {
    if (item.from) {
      const filteredFrom = item.from.filter(
        (fromInfo) => !(fromInfo.id === fromId && fromInfo.type === fromType)
      );
      if (filteredFrom.length > 0) {
        return { ...item, from: filteredFrom };
      } else {
        return null;
      }
    }
    return null;
  }).filter((item) => item !== null);
  saveSteamBindData(updatedData);
}
function backupSteamBindData() {
  try {
    const dataPath = pluginState.getDataFilePath(STEAM_BIND_DATA_FILE);
    const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
    if (!fs.existsSync(backupDirPath)) {
      fs.mkdirSync(backupDirPath, { recursive: true });
    }
    const currentData = loadSteamBindData();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFileName = `steam-bind-data.backup.${timestamp}.json`;
    const backupFilePath = path.join(backupDirPath, backupFileName);
    fs.writeFileSync(backupFilePath, JSON.stringify(currentData, null, 2), "utf-8");
    pluginState.logger.info(`Steam 绑定数据已备份到: ${backupFileName}`);
    cleanupOldBackups();
  } catch (error) {
    pluginState.logger.error("创建 Steam 绑定数据备份失败:", error);
  }
}
function cleanupOldBackups() {
  try {
    const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
    if (!fs.existsSync(backupDirPath)) {
      return;
    }
    const files = fs.readdirSync(backupDirPath);
    const backupFiles = files.filter(
      (file) => file.startsWith("steam-bind-data.backup.") && file.endsWith(".json")
    );
    backupFiles.sort((a, b) => {
      const timestampA = a.replace("steam-bind-data.backup.", "").replace(".json", "");
      const timestampB = b.replace("steam-bind-data.backup.", "").replace(".json", "");
      return timestampB.localeCompare(timestampA);
    });
    for (let i = MAX_BACKUP_FILES; i < backupFiles.length; i++) {
      const filePath = path.join(backupDirPath, backupFiles[i]);
      fs.unlinkSync(filePath);
      pluginState.logger.info(`已删除旧的备份文件: ${backupFiles[i]}`);
    }
  } catch (error) {
    pluginState.logger.error("清理旧备份文件失败:", error);
  }
}
function getLatestBackupFile() {
  try {
    const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
    if (!fs.existsSync(backupDirPath)) {
      return null;
    }
    const files = fs.readdirSync(backupDirPath);
    const backupFiles = files.filter(
      (file) => file.startsWith("steam-bind-data.backup.") && file.endsWith(".json")
    );
    if (backupFiles.length === 0) {
      return null;
    }
    backupFiles.sort((a, b) => {
      const timestampA = a.replace("steam-bind-data.backup.", "").replace(".json", "");
      const timestampB = b.replace("steam-bind-data.backup.", "").replace(".json", "");
      return timestampB.localeCompare(timestampA);
    });
    return path.join(backupDirPath, backupFiles[0]);
  } catch (error) {
    pluginState.logger.error("获取最新备份文件失败:", error);
    return null;
  }
}
function restoreSteamBindDataFromBackup() {
  try {
    const latestBackupPath = getLatestBackupFile();
    if (!latestBackupPath) {
      pluginState.logger.warn("未找到备份文件");
      return null;
    }
    const backupData = JSON.parse(fs.readFileSync(latestBackupPath, "utf-8"));
    pluginState.logger.info(`已从备份文件恢复数据: ${path.basename(latestBackupPath)}`);
    return backupData;
  } catch (error) {
    pluginState.logger.error("从备份恢复数据失败:", error);
    return null;
  }
}

class GameNameService {
  gameNames = null;
  // 延迟初始化，初始为 null
  dataFileName = "steam-game-names.json";
  fetchingSet = /* @__PURE__ */ new Set();
  initialized = false;
  // 初始化状态标志
  constructor() {
  }
  /**
   * 确保服务已初始化
   * 延迟加载游戏名称数据，避免模块加载时访问未初始化的 pluginState
   */
  ensureInitialized() {
    if (!this.initialized) {
      this.loadGameNames();
      this.initialized = true;
    }
  }
  /**
   * 获取格式化后的游戏名称
   * @param appid Steam游戏ID
   * @param enName 英文名
   * @returns 格式化后的游戏名称
   */
  async getFormattedGameName(appid, enName) {
    this.ensureInitialized();
    const gameName = await this.getGameName(appid, enName);
    return this.formatGameName(gameName);
  }
  /**
   * 获取游戏名称对象（懒加载）
   * 如果游戏不存在于表中，会创建新记录
   * 如果中文名不存在，会异步获取
   */
  async getGameName(appid, enName) {
    this.ensureInitialized();
    if (!appid || !enName) {
      pluginState.logger.warn("[GameNameService] appid或enName为空");
      return { en: enName || "未知游戏" };
    }
    if (this.gameNames[appid]) {
      const gameName = this.gameNames[appid];
      if (gameName.en !== enName) {
        gameName.en = enName;
        this.saveGameNames();
      }
      if (!gameName.zh && !this.fetchingSet.has(appid)) {
        this.fetchChineseName(appid, enName);
      }
      return gameName;
    }
    pluginState.logger.info(`[GameNameService] 发现新游戏: ${enName} (appid=${appid})`);
    const newGameName = { en: enName };
    this.gameNames[appid] = newGameName;
    this.saveGameNames();
    this.fetchChineseName(appid, enName);
    return newGameName;
  }
  /**
   * 格式化游戏名称
   * 规则:
   * 1. 中文名不存在: 返回英文名
   * 2. 中文名等于英文名(忽略大小写): 返回英文名
   * 3. 中文名包含英文名(忽略大小写): 返回中文名
   * 4. 英文名包含中文名: 返回英文名
   * 5. 其他情况: 返回 "英文名 / 中文名"
   */
  formatGameName(gameName) {
    const { en, zh } = gameName;
    if (!zh) {
      return en;
    }
    const enLower = en.toLowerCase();
    const zhLower = zh.toLowerCase();
    if (zhLower === enLower) {
      return en;
    }
    if (zhLower.includes(enLower)) {
      return zh;
    }
    if (en.includes(zh)) {
      return en;
    }
    return `${en} / ${zh}`;
  }
  /**
   * 从Steam商店API获取中文名
   * @param appid Steam游戏ID
   * @param enName 英文名（用于日志）
   * @returns 是否成功获取
   */
  async fetchChineseName(appid, enName) {
    if (this.fetchingSet.has(appid)) {
      return false;
    }
    this.fetchingSet.add(appid);
    try {
      pluginState.logger.info(`[GameNameService] 获取游戏中文名: ${enName} (appid=${appid})`);
      const url = `https://store.steampowered.com/api/appdetails/?appids=${appid}&cc=CN&l=schinese`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      if (!response.ok) {
        pluginState.logger.warn(`[GameNameService] Steam商店API返回错误: ${response.status} ${response.statusText}`);
        return false;
      }
      const data = await response.json();
      const appData = data[appid];
      if (!appData?.success || !appData.data?.name) {
        pluginState.logger.warn(`[GameNameService] Steam商店API返回失败: appid=${appid}`);
        return false;
      }
      const zhName = appData.data.name;
      if (this.gameNames[appid]) {
        this.gameNames[appid].zh = zhName;
        this.saveGameNames();
        pluginState.logger.info(`[GameNameService] 获取中文名成功: ${enName} -> ${zhName}`);
      }
      return true;
    } catch (error) {
      pluginState.logger.warn(`[GameNameService] 获取中文名失败: ${enName} (appid=${appid})`, error);
      return false;
    } finally {
      this.fetchingSet.delete(appid);
    }
  }
  /**
   * 加载游戏名称数据
   */
  loadGameNames() {
    try {
      this.gameNames = pluginState.loadDataFile(this.dataFileName, {});
      const count = Object.keys(this.gameNames).length;
      pluginState.logger.info(`[GameNameService] 加载了 ${count} 个游戏名称`);
    } catch (error) {
      pluginState.logger.error("[GameNameService] 加载游戏名称数据失败", error);
      this.gameNames = {};
    }
  }
  /**
   * 保存游戏名称数据
   */
  saveGameNames() {
    try {
      pluginState.saveDataFile(this.dataFileName, this.gameNames);
    } catch (error) {
      pluginState.logger.error("[GameNameService] 保存游戏名称数据失败", error);
    }
  }
  // ==================== 游戏名称管理 API ====================
  /**
   * 获取所有游戏名称
   * @returns 游戏名称列表
   */
  getAllGames() {
    this.ensureInitialized();
    return Object.entries(this.gameNames || {}).map(([appid, game]) => ({
      appid,
      en: game.en,
      zh: game.zh
    }));
  }
  /**
   * 更新游戏中文名称
   * @param appid Steam游戏ID
   * @param zh 新的中文名称
   * @returns 是否成功
   */
  updateChineseName(appid, zh) {
    this.ensureInitialized();
    if (!appid || !this.gameNames?.[appid]) {
      pluginState.logger.warn(`[GameNameService] 游戏不存在: ${appid}`);
      return false;
    }
    this.gameNames[appid].zh = zh;
    this.saveGameNames();
    pluginState.logger.info(`[GameNameService] 更新中文名: ${this.gameNames[appid].en} -> ${zh}`);
    return true;
  }
  /**
   * 删除游戏名称条目
   * @param appid Steam游戏ID
   * @returns 是否成功
   */
  deleteGame(appid) {
    this.ensureInitialized();
    if (!appid || !this.gameNames?.[appid]) {
      pluginState.logger.warn(`[GameNameService] 游戏不存在: ${appid}`);
      return false;
    }
    const gameName = this.gameNames[appid].en;
    delete this.gameNames[appid];
    this.saveGameNames();
    pluginState.logger.info(`[GameNameService] 删除游戏: ${gameName} (appid=${appid})`);
    return true;
  }
}
const gameNameService = new GameNameService();

class SteamCacheService {
  cacheFileName = "steam-status-cache.json";
  /**
   * 加载 Steam 状态缓存
   */
  loadCache() {
    return pluginState.loadDataFile(this.cacheFileName, {});
  }
  /**
   * 保存 Steam 状态缓存
   */
  saveCache(cache) {
    pluginState.saveDataFile(this.cacheFileName, cache);
  }
  /**
   * 更新缓存中的状态
   */
  updateCacheItem(steamId, playerSummary) {
    const cache = this.loadCache();
    const now = Date.now();
    const oldCache = cache[steamId];
    let gameStartTime;
    if (playerSummary.gameextrainfo) {
      if (oldCache?.gameextrainfo === playerSummary.gameextrainfo) {
        gameStartTime = oldCache.gameStartTime;
      } else {
        gameStartTime = now;
      }
    } else {
      gameStartTime = void 0;
    }
    cache[steamId] = {
      steamId,
      personaname: playerSummary.personaname,
      personastate: playerSummary.personastate,
      gameextrainfo: playerSummary.gameextrainfo,
      gameid: playerSummary.gameid,
      lastUpdateTime: now,
      gameStartTime
    };
    this.saveCache(cache);
  }
  /**
   * 批量更新缓存
   */
  updateCacheBatch(playerSummaries) {
    const cache = this.loadCache();
    const now = Date.now();
    for (const player of playerSummaries) {
      const oldCache = cache[player.steamid];
      let gameStartTime;
      if (player.gameextrainfo) {
        if (oldCache?.gameextrainfo === player.gameextrainfo) {
          gameStartTime = oldCache.gameStartTime;
        } else {
          gameStartTime = now;
        }
      } else {
        gameStartTime = void 0;
      }
      cache[player.steamid] = {
        steamId: player.steamid,
        personaname: player.personaname,
        personastate: player.personastate,
        gameextrainfo: player.gameextrainfo,
        gameid: player.gameid,
        lastUpdateTime: now,
        gameStartTime
      };
    }
    this.saveCache(cache);
  }
  /**
   * 检测状态变化
   * @param currentSummaries 当前查询到的玩家状态
   * @returns 状态变化检测结果数组
   */
  detectStatusChanges(currentSummaries) {
    const cache = this.loadCache();
    const changes = [];
    for (const current of currentSummaries) {
      const cached = cache[current.steamid] || null;
      const change = this.analyzeStatusChange(cached, current);
      if (change) {
        changes.push(change);
      }
    }
    return changes;
  }
  /**
   * 分析单个用户的状态变化
   */
  analyzeStatusChange(oldStatus, newStatus) {
    if (!oldStatus) {
      return null;
    }
    if (newStatus.gameid && newStatus.gameextrainfo) {
      gameNameService.getFormattedGameName(newStatus.gameid, newStatus.gameextrainfo).catch((err) => {
        pluginState.logger.warn("[SteamCacheService] 预加载游戏名称失败", err);
      });
    }
    const oldWasOnline = oldStatus.personastate > 0;
    const newIsOnline = newStatus.personastate > 0;
    const oldWasInGame = !!oldStatus.gameextrainfo;
    const newIsInGame = !!newStatus.gameextrainfo;
    const oldIsAfk = oldWasInGame && (oldStatus.personastate === 3 || oldStatus.personastate === 4);
    const newIsAfk = newIsInGame && (newStatus.personastate === 3 || newStatus.personastate === 4);
    if (oldWasInGame && !newIsOnline) {
      return {
        steamId: newStatus.steamid,
        oldStatus,
        newStatus,
        changeType: "quitGame"
      };
    }
    if (oldStatus.personastate !== newStatus.personastate) {
      if (!oldWasOnline && newIsOnline && !newIsInGame) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "online"
        };
      } else if (!oldWasOnline && newIsOnline && newIsInGame && newStatus.personastate === 1) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "ingame"
        };
      } else if (!oldWasOnline && newIsOnline && newIsAfk) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "inAfk"
        };
      } else if (oldWasOnline && !newIsOnline && !oldWasInGame) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "offline"
        };
      } else if (oldWasInGame && !oldIsAfk && newIsAfk) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "inAfk"
        };
      } else if (oldIsAfk && newIsInGame && !newIsAfk) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "outAfk"
        };
      }
    }
    if (oldWasInGame !== newIsInGame) {
      if (newIsInGame && !oldWasInGame && newStatus.personastate === 1) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "ingame"
        };
      } else if (newIsInGame && !oldWasInGame && newIsAfk) {
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "inAfk"
        };
      } else if (!newIsInGame && oldWasInGame) {
        if (oldStatus.gameStartTime) {
          const playTimeMs = Date.now() - oldStatus.gameStartTime;
          const playTimeMinutes = Math.floor(playTimeMs / 6e4);
          const playTimeHours = Math.floor(playTimeMinutes / 60);
          const playTimeSeconds = Math.floor(playTimeMs % 6e4 / 1e3);
          let playTimeStr = "";
          if (playTimeHours > 0) {
            playTimeStr += `${playTimeHours}小时`;
          }
          if (playTimeMinutes > 0) {
            playTimeStr += `${playTimeMinutes % 60}分钟`;
          }
          if (playTimeSeconds > 0 || playTimeStr === "") {
            playTimeStr += `${playTimeSeconds}秒`;
          }
          pluginState.logger.info(
            `玩家 ${newStatus.personaname} (${newStatus.steamid}) 结束了游戏 ${oldStatus.gameextrainfo}，游玩时间：${playTimeStr}`
          );
        }
        return {
          steamId: newStatus.steamid,
          oldStatus,
          newStatus,
          changeType: "outgame"
        };
      }
    } else if (oldWasInGame && newIsInGame && oldStatus.gameextrainfo !== newStatus.gameextrainfo) {
      if (oldStatus.gameStartTime) {
        const playTimeMs = Date.now() - oldStatus.gameStartTime;
        const playTimeMinutes = Math.floor(playTimeMs / 6e4);
        const playTimeHours = Math.floor(playTimeMinutes / 60);
        const playTimeSeconds = Math.floor(playTimeMs % 6e4 / 1e3);
        let playTimeStr = "";
        if (playTimeHours > 0) {
          playTimeStr += `${playTimeHours}小时`;
        }
        if (playTimeMinutes > 0) {
          playTimeStr += `${playTimeMinutes % 60}分钟`;
        }
        if (playTimeSeconds > 0 || playTimeStr === "") {
          playTimeStr += `${playTimeSeconds}秒`;
        }
        pluginState.logger.info(
          `玩家 ${newStatus.personaname} (${newStatus.steamid}) 切换游戏，结束了 ${oldStatus.gameextrainfo}，游玩时间：${playTimeStr}`
        );
      }
      return {
        steamId: newStatus.steamid,
        oldStatus,
        newStatus,
        changeType: "switchGame"
      };
    }
    return null;
  }
  /**
   * 清空缓存
   */
  clearCache() {
    this.saveCache({});
  }
}
const steamCacheService = new SteamCacheService();

class SteamPollingService {
  pollingTimer = null;
  isPollingActive = false;
  /**
   * 获取当前轮询间隔（毫秒）
   */
  getPollingInterval() {
    const intervalSeconds = Math.min(
      3600,
      // 最大1小时
      Math.max(1, pluginState.config.pollingIntervalSeconds || 60)
    );
    return intervalSeconds * 1e3;
  }
  /**
   * 启动轮询服务
   */
  startPolling() {
    if (this.isPollingActive) {
      pluginState.logger.warn("Steam 轮询服务已在运行中");
      return;
    }
    if (!pluginState.config.steamApiKey) {
      pluginState.logger.warn("未配置 Steam API Key，无法启动 Steam 轮询服务");
      return;
    }
    this.isPollingActive = true;
    steamService.validateApiKey().then((isValid) => {
      if (!isValid) {
        this.isPollingActive = false;
        pluginState.logger.warn("Steam API Key 无效，无法启动 Steam 轮询服务");
        return;
      }
      const interval = this.getPollingInterval();
      this.pollingTimer = setInterval(() => {
        this.pollSteamStatuses();
      }, interval);
      pluginState.timers.set("steam-polling", this.pollingTimer);
      pluginState.logger.info(`Steam 轮询服务已启动，每 ${interval / 1e3} 秒检查一次状态变化`);
    }).catch((error) => {
      this.isPollingActive = false;
      pluginState.logger.error("验证 Steam API Key 时出错:", error);
    });
  }
  /**
   * 停止轮询服务
   */
  stopPolling() {
    if (!this.isPollingActive) {
      pluginState.logger.warn("Steam 轮询服务未运行");
      return;
    }
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      pluginState.timers.delete("steam-polling");
      this.pollingTimer = null;
    }
    this.isPollingActive = false;
    pluginState.logger.info("Steam 轮询服务已停止");
  }
  /**
   * 执行一次 Steam 状态轮询
   */
  async pollSteamStatuses() {
    try {
      pluginState.logger.debug("开始执行 Steam 状态轮询");
      const allBindItems = this.getAllSteamBindItems();
      if (allBindItems.length === 0) {
        pluginState.logger.debug("没有绑定的 Steam 用户，跳过轮询");
        return;
      }
      const allSteamIds = [...new Set(allBindItems.map((item) => item.steamId))];
      pluginState.logger.debug(`检测到 ${allSteamIds.length} 个唯一的 Steam 用户`);
      const batchSize = 100;
      for (let i = 0; i < allSteamIds.length; i += batchSize) {
        const batch = allSteamIds.slice(i, i + batchSize);
        try {
          const playerSummaries = await steamService.getPlayerSummaries(batch);
          if (playerSummaries.length > 0) {
            const changes = steamCacheService.detectStatusChanges(playerSummaries);
            if (changes.length > 0) {
              pluginState.logger.info(`检测到 ${changes.length} 个 Steam 状态变化`);
              await this.handleStatusChanges(changes, allBindItems);
            }
            steamCacheService.updateCacheBatch(playerSummaries);
          }
        } catch (error) {
          pluginState.logger.error(`查询 Steam 批次 ${i / batchSize + 1} 时出错:`, error);
        }
      }
      pluginState.logger.debug("Steam 状态轮询完成");
    } catch (error) {
      pluginState.logger.error("执行 Steam 状态轮询时出错:", error);
    }
  }
  /**
   * 获取所有 Steam 绑定项
   */
  getAllSteamBindItems() {
    return pluginState.loadDataFile("steam-bind-data.json", []);
  }
  /**
   * 处理检测到的状态变化
   */
  async handleStatusChanges(changes, allBindItems) {
    const notifyStatusTypes = pluginState.config.notifyStatusTypes || [];
    const filteredChanges = changes.filter(
      (change) => notifyStatusTypes.includes(change.changeType)
    );
    if (filteredChanges.length === 0) {
      pluginState.logger.debug("所有状态变化都被过滤，跳过推送");
      return;
    }
    if (filteredChanges.length < changes.length) {
      pluginState.logger.debug(`过滤后剩余 ${filteredChanges.length}/${changes.length} 个状态变化`);
    }
    for (const change of filteredChanges) {
      try {
        const relatedBindItems = allBindItems.filter((item) => item.steamId === change.steamId);
        if (relatedBindItems.length === 0) {
          pluginState.logger.warn(`未找到 Steam ID ${change.steamId} 的绑定项，跳过推送`);
          continue;
        }
        for (const bindItem of relatedBindItems) {
          if (bindItem.from && bindItem.from.length > 0) {
            for (const fromInfo of bindItem.from) {
              try {
                const message = await this.generateStatusChangeMessageForFrom(change, fromInfo, bindItem);
                await this.sendMessageToSource(fromInfo, message, bindItem, change);
              } catch (error) {
                pluginState.logger.error(`向 ${fromInfo.type} ${fromInfo.id} 推送消息时出错:`, error);
              }
            }
          }
        }
      } catch (error) {
        pluginState.logger.error(`处理 Steam ID ${change.steamId} 的状态变化时出错:`, error);
      }
    }
  }
  /**
   * 为特定来源生成状态变化推送消息
   */
  async generateStatusChangeMessageForFrom(change, fromInfo, bindItem) {
    const customNickname = fromInfo.nickname || change.newStatus.personaname;
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleString("zh-CN");
    let message = `[${timestamp}] ${customNickname}`;
    switch (change.changeType) {
      case "online":
        message += " 上线了";
        break;
      case "offline":
        message += " 离线了";
        break;
      case "ingame":
        if (change.newStatus.gameextrainfo && change.newStatus.gameid) {
          const formattedGameName = await gameNameService.getFormattedGameName(
            change.newStatus.gameid,
            change.newStatus.gameextrainfo
          );
          message += ` 正在游玩 ${formattedGameName}`;
        } else if (change.newStatus.gameextrainfo) {
          message += ` 正在游玩 ${change.newStatus.gameextrainfo}`;
        } else {
          message += " 开始玩游戏了";
        }
        break;
      case "outgame": {
        let gameName = change.oldStatus?.gameextrainfo || "";
        if (change.oldStatus?.gameid && gameName) {
          gameName = await gameNameService.getFormattedGameName(
            change.oldStatus.gameid,
            gameName
          );
        }
        message += ` 结束游玩 ${gameName}`;
        if (change.oldStatus?.gameStartTime) {
          const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
          const playTimeMinutes = Math.floor(playTimeMs / 6e4);
          const playTimeHours = Math.floor(playTimeMinutes / 60);
          const playTimeSeconds = Math.floor(playTimeMs % 6e4 / 1e3);
          let playTimeStr = "";
          if (playTimeHours > 0) {
            playTimeStr += `${playTimeHours}小时`;
          }
          if (playTimeMinutes > 0) {
            playTimeStr += `${playTimeMinutes % 60}分钟`;
          }
          if (playTimeSeconds > 0 || playTimeStr === "") {
            playTimeStr += `${playTimeSeconds}秒`;
          }
          message += `（游玩时长：${playTimeStr}）`;
        }
        break;
      }
      case "inAfk": {
        message += " 开始挂机";
        if (change.newStatus.gameextrainfo && change.newStatus.gameid) {
          const formattedGameName = await gameNameService.getFormattedGameName(
            change.newStatus.gameid,
            change.newStatus.gameextrainfo
          );
          message += ` - ${formattedGameName}`;
        } else if (change.newStatus.gameextrainfo) {
          message += ` - ${change.newStatus.gameextrainfo}`;
        }
        break;
      }
      case "outAfk": {
        message += " 结束挂机";
        if (change.newStatus.gameextrainfo && change.newStatus.gameid) {
          const formattedGameName = await gameNameService.getFormattedGameName(
            change.newStatus.gameid,
            change.newStatus.gameextrainfo
          );
          message += ` - ${formattedGameName}`;
        } else if (change.newStatus.gameextrainfo) {
          message += ` - ${change.newStatus.gameextrainfo}`;
        }
        break;
      }
      case "quitGame": {
        let gameName = change.oldStatus?.gameextrainfo || "";
        if (change.oldStatus?.gameid && gameName) {
          gameName = await gameNameService.getFormattedGameName(
            change.oldStatus.gameid,
            gameName
          );
        }
        message += ` 结束游玩并下线 ${gameName}`;
        if (change.oldStatus?.gameStartTime) {
          const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
          const playTimeMinutes = Math.floor(playTimeMs / 6e4);
          const playTimeHours = Math.floor(playTimeMinutes / 60);
          const playTimeSeconds = Math.floor(playTimeMs % 6e4 / 1e3);
          let playTimeStr = "";
          if (playTimeHours > 0) {
            playTimeStr += `${playTimeHours}小时`;
          }
          if (playTimeMinutes > 0) {
            playTimeStr += `${playTimeMinutes % 60}分钟`;
          }
          if (playTimeSeconds > 0 || playTimeStr === "") {
            playTimeStr += `${playTimeSeconds}秒`;
          }
          message += `（游玩时长：${playTimeStr}）`;
        }
        break;
      }
      case "switchGame": {
        let oldGameName = change.oldStatus?.gameextrainfo || "";
        if (change.oldStatus?.gameid && oldGameName) {
          oldGameName = await gameNameService.getFormattedGameName(
            change.oldStatus.gameid,
            oldGameName
          );
        }
        let newGameName = "";
        if (change.newStatus.gameid && change.newStatus.gameextrainfo) {
          newGameName = await gameNameService.getFormattedGameName(
            change.newStatus.gameid,
            change.newStatus.gameextrainfo
          );
        }
        message += ` 结束游玩 ${oldGameName}`;
        if (change.oldStatus?.gameStartTime) {
          const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
          const playTimeMinutes = Math.floor(playTimeMs / 6e4);
          const playTimeHours = Math.floor(playTimeMinutes / 60);
          const playTimeSeconds = Math.floor(playTimeMs % 6e4 / 1e3);
          let playTimeStr = "";
          if (playTimeHours > 0) {
            playTimeStr += `${playTimeHours}小时`;
          }
          if (playTimeMinutes > 0) {
            playTimeStr += `${playTimeMinutes % 60}分钟`;
          }
          if (playTimeSeconds > 0 || playTimeStr === "") {
            playTimeStr += `${playTimeSeconds}秒`;
          }
          message += `（游玩时长：${playTimeStr}）`;
        }
        message += `，开始游玩 ${newGameName}`;
        break;
      }
      default:
        message += ` 状态更新: ${steamService.formatPlayerState(change.newStatus.personastate)}`;
        if (change.newStatus.gameextrainfo) {
          message += ` - ${change.newStatus.gameextrainfo}`;
        }
        break;
    }
    return message;
  }
  /**
   * 向指定来源发送消息
   */
  async sendMessageToSource(fromInfo, message, bindItem, change) {
    try {
      const statusText = this.getStatusText(change);
      let gameName = "";
      if ((change.changeType === "outgame" || change.changeType === "quitGame") && (change.oldStatus && change.oldStatus.gameextrainfo && change.oldStatus.gameid)) {
        gameName = await gameNameService.getFormattedGameName(
          change.oldStatus.gameid,
          change.oldStatus.gameextrainfo
        );
      } else if (change.newStatus.gameid && change.newStatus.gameextrainfo) {
        gameName = await gameNameService.getFormattedGameName(
          change.newStatus.gameid,
          change.newStatus.gameextrainfo
        );
      }
      const hasGameName = !!gameName;
      const MIN_SVG_WIDTH = 400;
      const leftPadding = 115;
      const rightPadding = 20;
      const nicknameFontSize = 18;
      let line1Text = change.newStatus.personaname || "";
      if (fromInfo.nickname) {
        line1Text += ` (${fromInfo.nickname})`;
      }
      const line1Width = this.calculateTextWidth(line1Text, nicknameFontSize);
      const gameNameFontSize = 16;
      const line3Text = gameName || "";
      const line3Width = this.calculateTextWidth(line3Text, gameNameFontSize);
      const maxTextWidth = Math.max(line1Width, line3Width);
      const svgWidth = Math.max(MIN_SVG_WIDTH, leftPadding + maxTextWidth + rightPadding);
      const svgHeight = 100;
      const imageFace = bindItem.face || change.newStatus.avatarmedium || "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg";
      const notHasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <!-- 背景 -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#202227"/>
  
  <!-- 用户头像 -->
  <image href="${imageFace}"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  
  <!-- 状态指示条 -->
  <rect x="90" y="10" width="4" height="80" fill="#4cb4ff"/>
  
  <!-- 文本内容 -->
  <g font-family="'Microsoft YaHei', 'SimHei', sans-serif">
    <!-- 用户名 + 可选昵称 -->
    <text x="115" y="36" font-size="18" font-weight="bold">
      <tspan fill="#4cb4ff">${this.escapeXml(change.newStatus.personaname)}</tspan>
       ${fromInfo.nickname ? `<tspan dx="8" fill="#898a8b">(${this.escapeXml(fromInfo.nickname)})</tspan>` : ""}
    </text>
    
    <!-- 状态文本 -->
    <text x="115" y="68" fill="#898a8b" font-size="16">
      <tspan fill="#898a8b">当前</tspan>
      <tspan fill="#4cb4ff">${this.escapeXml(statusText)}</tspan>
    </text>
  </g>
</svg>`;
      const hasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="${svgWidth}" height="${svgHeight}" fill="#202227"/>
  <image href="${imageFace}"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  <rect x="90" y="10" width="4" height="80" fill="#4CAF50"/>
  <g font-family="'Microsoft YaHei', 'SimHei', sans-serif">
    <text x="115" y="30" font-size="18" font-weight="bold">
      <tspan fill="#cee8b1">${this.escapeXml(change.newStatus.personaname)}</tspan>
      ${fromInfo.nickname ? `<tspan dx="8" fill="#898a8b">(${this.escapeXml(fromInfo.nickname)})</tspan>` : ""}
    </text>
    <text x="115" y="59" fill="#898a8b" font-size="16">
      ${this.escapeXml(statusText)}
    </text>
    <text x="115" y="84" fill="#91c257" font-size="16" font-weight="500">${this.escapeXml(gameName)}</text>
  </g>
</svg>`;
      const svgContent = hasGameName ? hasGameNameSvgContent : notHasGameNameSvgContent;
      const svgBase64 = await this.renderSvgToBase64(svgContent);
      if (svgBase64) {
        if (fromInfo.type === "group") {
          await sendGroupMessage(pluginState.ctx, parseInt(fromInfo.id), [
            { type: "text", data: { text: message + "\n" } },
            {
              type: "image",
              data: { file: `base64://${svgBase64}` }
            }
          ]);
        } else if (fromInfo.type === "private") {
          await sendPrivateMessage(pluginState.ctx, parseInt(fromInfo.id), [
            { type: "text", data: { text: message + "\n" } },
            {
              type: "image",
              data: { file: `base64://${svgBase64}` }
            }
          ]);
        }
      } else {
        if (fromInfo.type === "group") {
          await sendGroupMessage(pluginState.ctx, parseInt(fromInfo.id), message);
        } else if (fromInfo.type === "private") {
          await sendPrivateMessage(pluginState.ctx, parseInt(fromInfo.id), message);
        }
      }
    } catch (error) {
      pluginState.logger.error("发送带图片的消息失败，回退到纯文本:", error);
      if (fromInfo.type === "group") {
        await sendGroupMessage(pluginState.ctx, parseInt(fromInfo.id), message);
      } else if (fromInfo.type === "private") {
        await sendPrivateMessage(pluginState.ctx, parseInt(fromInfo.id), message);
      }
    }
  }
  /**
   * 使用 svg-convert 渲染 SVG 为 base64 图片
   */
  async renderSvgToBase64(svg) {
    try {
      const port = 6099;
      const host = `http://127.0.0.1:${port}`;
      const url = `${host}/plugin/napcat-plugin-svg-render/api/svg/render`;
      pluginState.logger.debug(`调用 svg-convert 渲染，SVG 长度: ${svg.length}`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svg,
          saveWebImage: true
          // 保存网络图片到缓存，提高下次渲染速度
        }),
        signal: AbortSignal.timeout(3e4)
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.imageBase64) {
        pluginState.logger.debug("svg-convert 渲染成功");
        const base64Data = data.data.imageBase64.replace(/^data:image\/png;base64,/, "");
        return base64Data;
      }
      pluginState.logger.warn(`svg-convert 渲染失败: ${data.message || "未知错误"}`);
      return null;
    } catch (e) {
      pluginState.logger.error(`svg-convert 渲染请求失败: ${e}`);
      return null;
    }
  }
  /**
   * 获取状态文本
   */
  getStatusText(change) {
    switch (change.changeType) {
      case "online":
        return "在线";
      case "offline":
        return "离线";
      case "ingame":
        return "正在玩";
      case "outgame":
        return "结束游玩";
      case "inAfk":
        return "正在挂机";
      case "outAfk":
        return "结束挂机";
      case "quitGame":
        return "结束游玩并下线";
      case "switchGame":
        return "切换游戏";
      default:
        return steamService.formatPlayerState(change.newStatus.personastate);
    }
  }
  /**
   * 判断字符是否为全角字符
   * @param char 单个字符
   * @returns 是否为全角字符
   */
  isFullWidthChar(char) {
    const code = char.codePointAt(0) || 0;
    return (
      // CJK 统一表意文字及扩展区
      code >= 19968 && code <= 40959 || code >= 13312 && code <= 19903 || code >= 131072 && code <= 173791 || code >= 173824 && code <= 177983 || code >= 177984 && code <= 178207 || code >= 178208 && code <= 183983 || // 日文假名
      code >= 12352 && code <= 12447 || code >= 12448 && code <= 12543 || // 韩文音节
      code >= 44032 && code <= 55215 || // 全角 ASCII 及标点
      code >= 65280 && code <= 65519 || // 其他常见全角标点
      code >= 12288 && code <= 12351
    );
  }
  /**
   * 计算字符串的预计显示宽度
   * @param text 输入字符串
   * @param fontSize 字体字号（单位：px）
   * @returns 预计总宽度
   */
  calculateTextWidth(text, fontSize) {
    if (!text || fontSize <= 0) return 0;
    let totalWidth = 0;
    for (const char of text) {
      const widthFactor = this.isFullWidthChar(char) ? 1 : 0.6;
      totalWidth += fontSize * widthFactor;
    }
    return totalWidth;
  }
  /**
   * 转义 XML 特殊字符
   */
  escapeXml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  /**
   * 获取轮询服务状态
   */
  getStatus() {
    const interval = this.getPollingInterval();
    return {
      isActive: this.isPollingActive,
      interval,
      nextPoll: this.pollingTimer ? Date.now() + interval : 0
    };
  }
}
const steamPollingService = new SteamPollingService();

function isValidSteamId64$1(steamId) {
  return /^\d+$/.test(steamId);
}
async function handleSteamBind(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-bind");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  if (args.length < 2) {
    await sendReply(ctx, event, "用法: #steam-bind <steam-id> [自定义用户昵称]");
    return;
  }
  try {
    let steamId = args[1];
    const nickname = args.length > 2 ? args[2] : void 0;
    if (!isValidSteamId64$1(steamId)) {
      pluginState.logger.debug(`Steam ID 不是纯数字格式，尝试解析为自定义 ID: ${steamId}`);
      const resolvedId = await steamService.getSteamID64(steamId);
      if (!resolvedId) {
        await sendReply(ctx, event, `Steam ID 格式无效，请输入有效的 Steam ID64（纯数字）或自定义 ID`);
        return;
      }
      steamId = resolvedId;
    }
    let playerSummary = await steamService.getPlayerSummary(steamId);
    if (!playerSummary) {
      const playSteamId = await steamService.getSteamID64(steamId);
      pluginState.logger.debug(`进行二次验证`, playSteamId);
      if (playSteamId) {
        playerSummary = await steamService.getPlayerSummary(playSteamId);
        steamId = playSteamId;
      }
    }
    if (!playerSummary) {
      await sendReply(ctx, event, `无法找到 Steam 用户: ${steamId}，请检查 Steam ID 是否正确。`);
      return;
    }
    let bindItem = findSteamBindItem(steamId);
    if (!bindItem) {
      bindItem = {
        steamId,
        personName: playerSummary?.personaname,
        // 存储 Steam 用户的昵称
        face: playerSummary?.avatarmedium,
        // 存储用户头像链接
        from: [{
          id: messageType === "group" ? String(groupId) : String(event.user_id),
          type: messageType,
          nickname: nickname || void 0
        }]
      };
    } else {
      const newFromInfo = {
        id: messageType === "group" ? String(groupId) : String(event.user_id),
        type: messageType,
        nickname: nickname || void 0
      };
      const existingIndex = bindItem.from?.findIndex(
        (fromInfo) => fromInfo.id === newFromInfo.id && fromInfo.type === newFromInfo.type
      );
      if (existingIndex !== void 0 && existingIndex !== -1) {
        bindItem.from[existingIndex] = { ...bindItem.from[existingIndex], ...newFromInfo };
      } else {
        if (!bindItem.from) {
          bindItem.from = [];
        }
        bindItem.from.push(newFromInfo);
      }
      if (playerSummary?.avatarmedium) {
        bindItem.face = playerSummary.avatarmedium;
      }
      if (playerSummary?.personaname) {
        bindItem.personName = playerSummary.personaname;
      }
    }
    updateSteamBindItem(bindItem);
    try {
      await steamPollingService.pollSteamStatuses();
      pluginState.logger.debug(`绑定完成后手动触发状态查询成功`);
    } catch (error) {
      pluginState.logger.warn(`绑定完成后状态查询失败:`, error);
    }
    await sendReply(ctx, event, `成功绑定 Steam 用户: ${playerSummary.personaname} (ID: ${steamId})${nickname ? `，昵称: ${nickname}` : ""}`);
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("绑定 Steam 数据时出错:", error);
    await sendReply(ctx, event, `绑定失败: ${error.message}`);
  }
  if (messageType === "group" && groupId) setCooldown(groupId, "steam-bind");
}

function isValidSteamId64(steamId) {
  return /^\d+$/.test(steamId);
}
function parseBatchArgs(rawMessage) {
  const prefix = "#steam-bind-batch";
  const content = rawMessage.slice(rawMessage.indexOf(prefix) + prefix.length).trim();
  const tokens = content.split(/\s+/).filter((token) => token.length > 0);
  const pairs = [];
  for (let i = 0; i < tokens.length; i += 2) {
    if (i + 1 < tokens.length) {
      pairs.push({
        steamId: tokens[i],
        nickname: tokens[i + 1]
      });
    }
  }
  return pairs;
}
async function handleSteamBindBatch(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  const rawMessage = event.raw_message || "";
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-bind-batch");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  const pairs = parseBatchArgs(rawMessage);
  if (pairs.length === 0) {
    await sendReply(
      ctx,
      event,
      "用法: #steam-bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ...\n参数间可使用空格、换行或制表符分隔"
    );
    return;
  }
  const results = [];
  for (const pair of pairs) {
    try {
      let steamId = pair.steamId;
      const nickname = pair.nickname;
      if (!isValidSteamId64(steamId)) {
        pluginState.logger.debug(`批量绑定: Steam ID 不是纯数字格式，尝试解析为自定义 ID: ${steamId}`);
        const resolvedId = await steamService.getSteamID64(steamId);
        if (!resolvedId) {
          results.push({
            steamId: pair.steamId,
            nickname,
            success: false,
            message: "Steam ID 格式无效（应为纯数字）"
          });
          continue;
        }
        steamId = resolvedId;
      }
      let playerSummary = await steamService.getPlayerSummary(steamId);
      if (!playerSummary) {
        const resolvedSteamId = await steamService.getSteamID64(steamId);
        if (resolvedSteamId) {
          playerSummary = await steamService.getPlayerSummary(resolvedSteamId);
          steamId = resolvedSteamId;
        }
      }
      if (!playerSummary) {
        results.push({
          steamId: pair.steamId,
          nickname,
          success: false,
          message: "无法找到 Steam 用户"
        });
        continue;
      }
      let bindItem = findSteamBindItem(steamId);
      if (!bindItem) {
        bindItem = {
          steamId,
          personName: playerSummary.personaname,
          face: playerSummary.avatarmedium,
          from: [
            {
              id: messageType === "group" ? String(groupId) : String(event.user_id),
              type: messageType,
              nickname: nickname || void 0
            }
          ]
        };
      } else {
        const newFromInfo = {
          id: messageType === "group" ? String(groupId) : String(event.user_id),
          type: messageType,
          nickname: nickname || void 0
        };
        const existingIndex = bindItem.from?.findIndex(
          (fromInfo) => fromInfo.id === newFromInfo.id && fromInfo.type === newFromInfo.type
        );
        if (existingIndex !== void 0 && existingIndex !== -1) {
          bindItem.from[existingIndex] = { ...bindItem.from[existingIndex], ...newFromInfo };
        } else {
          if (!bindItem.from) {
            bindItem.from = [];
          }
          bindItem.from.push(newFromInfo);
        }
        if (playerSummary.avatarmedium) {
          bindItem.face = playerSummary.avatarmedium;
        }
        if (playerSummary.personaname) {
          bindItem.personName = playerSummary.personaname;
        }
      }
      updateSteamBindItem(bindItem);
      results.push({
        steamId,
        nickname,
        success: true,
        message: playerSummary.personaname
      });
      pluginState.incrementProcessed();
    } catch (error) {
      pluginState.logger.error("批量绑定 Steam 数据时出错:", error);
      results.push({
        steamId: pair.steamId,
        nickname: pair.nickname,
        success: false,
        message: error.message || "未知错误"
      });
    }
  }
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  let resultMessage = `[= 批量绑定结果 =]
成功: ${successCount} 个 | 失败: ${failCount} 个
`;
  if (successCount > 0) {
    resultMessage += "\n[成功列表]\n";
    results.filter((r) => r.success).forEach((r) => {
      resultMessage += `✓ ${r.steamId} (${r.nickname}) - ${r.message}
`;
    });
  }
  if (failCount > 0) {
    resultMessage += "\n[失败列表]\n";
    results.filter((r) => !r.success).forEach((r) => {
      resultMessage += `✗ ${r.steamId} (${r.nickname}) - ${r.message}
`;
    });
  }
  await sendReply(ctx, event, resultMessage.trim());
  if (successCount > 0) {
    try {
      await steamPollingService.pollSteamStatuses();
      pluginState.logger.debug(`批量绑定完成后手动触发状态查询成功，共 ${successCount} 个绑定`);
    } catch (error) {
      pluginState.logger.warn(`批量绑定完成后状态查询失败:`, error);
    }
  }
  if (messageType === "group" && groupId) {
    setCooldown(groupId, "steam-bind-batch");
  }
}

async function handleSteamList(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-list");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  try {
    const currentFromId = event.message_type === "group" ? String(event.group_id) : String(event.user_id);
    const currentFromType = event.message_type === "group" ? "group" : "private";
    const bindData = findSteamBindItemsByFrom(currentFromId, currentFromType);
    if (bindData.length === 0) {
      await sendReply(ctx, event, "当前没有绑定的 Steam 用户数据");
      return;
    }
    const cache = steamCacheService.loadCache();
    const listItems = bindData.map((item, index) => {
      const steamId = item.steamId;
      const cachedStatus = cache[steamId];
      let statusText = "离线";
      if (cachedStatus) {
        const stateText = steamService.formatPlayerState(cachedStatus.personastate);
        if (cachedStatus.gameextrainfo) {
          statusText = `${stateText} - 游戏: ${cachedStatus.gameextrainfo}`;
        } else {
          statusText = stateText;
        }
      }
      const fromInfo = item.from?.find(
        (from) => from.id === currentFromId && from.type === currentFromType
      );
      const displayNickname = fromInfo?.nickname ? ` (${fromInfo.nickname})` : "";
      const personName = item.personName || "未知昵称";
      return `${index + 1}. ${personName}${displayNickname} (Steam ID: ${steamId})
   状态: ${statusText}`;
    });
    const listText = ["当前绑定的 Steam 用户列表:", ...listItems].join("\n");
    await sendReply(ctx, event, listText);
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("获取 Steam 绑定列表时出错:", error);
    await sendReply(ctx, event, `获取列表失败: ${error.message}`);
  }
  if (messageType === "group" && groupId) setCooldown(groupId, "steam-list");
}

async function handleSteamRemove(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-remove");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  try {
    if (args.length < 2) {
      await sendReply(ctx, event, "指令格式错误，请使用: #steam-remove <steam-id>");
      return;
    }
    const steamId = args[1];
    if (!steamId) {
      await sendReply(ctx, event, "请输入要移除的 Steam ID");
      return;
    }
    const currentFromId = event.message_type === "group" ? String(event.group_id) : String(event.user_id);
    const currentFromType = event.message_type === "group" ? "group" : "private";
    const bindItem = findSteamBindItem(steamId);
    if (!bindItem) {
      await sendReply(ctx, event, `未找到 Steam ID ${steamId} 的绑定数据`);
      return;
    }
    if (!bindItem.from || !bindItem.from.some(
      (fromInfo) => fromInfo.id === currentFromId && fromInfo.type === currentFromType
    )) {
      await sendReply(ctx, event, `您没有权限移除 Steam ID ${steamId} 的绑定数据`);
      return;
    }
    const data = loadSteamBindData();
    const updatedData = data.map((item) => {
      if (item.steamId === steamId) {
        if (item.from) {
          const filteredFrom = item.from.filter(
            (fromInfo) => !(fromInfo.id === currentFromId && fromInfo.type === currentFromType)
          );
          if (filteredFrom.length > 0) {
            return { ...item, from: filteredFrom };
          } else {
            return null;
          }
        }
        return null;
      }
      return item;
    }).filter((item) => item !== null);
    saveSteamBindData(updatedData);
    await sendReply(ctx, event, `已成功移除 Steam ID ${steamId} 的绑定数据`);
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("移除 Steam 绑定数据时出错:", error);
    await sendReply(ctx, event, `移除失败: ${error.message}`);
  }
  if (messageType === "group" && groupId) setCooldown(groupId, "steam-remove");
}

async function handleSteamReset(ctx, event, args) {
  const messageType = event.message_type;
  const groupId = event.group_id;
  if (messageType === "group" && groupId) {
    const remaining = getCooldownRemaining(groupId, "steam-reset");
    if (remaining > 0) {
      await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
      return;
    }
  }
  try {
    const currentFromId = event.message_type === "group" ? String(event.group_id) : String(event.user_id);
    const currentFromType = event.message_type;
    removeSteamBindItemFrom(currentFromId, currentFromType);
    await sendReply(ctx, event, `已清空当前${currentFromType === "private" ? "用户" : "群组"}的steam绑定数据`);
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("清空Steam绑定数据时出错:", error);
    await sendReply(ctx, event, `清空失败: ${error.message}`);
  }
  if (messageType === "group" && groupId) setCooldown(groupId, "steam-reset");
}

async function handleSteamPolling(ctx, event, args) {
  try {
    if (event.message_type !== "private") {
      await sendReply(ctx, event, "该指令仅支持私聊使用");
      return;
    }
    const userId = String(event.user_id);
    if (!pluginState.isUserAdmin(userId)) {
      await sendReply(ctx, event, "您没有权限执行此操作");
      return;
    }
    if (!pluginState.config.enabled) {
      await sendReply(ctx, event, "插件功能未启用");
      return;
    }
    if (!pluginState.config.steamApiKey) {
      await sendReply(ctx, event, "未配置 Steam API Key，无法执行轮询");
      return;
    }
    pluginState.logger.info(`用户 ${userId} 手动触发 Steam 状态轮询`);
    await steamPollingService.pollSteamStatuses();
    await sendReply(ctx, event, "已手动执行 Steam 状态轮询");
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("执行手动轮询时出错:", error);
    await sendReply(ctx, event, `手动轮询失败: ${error.message}`);
  }
}

async function handleAdmin(ctx, event, args) {
  try {
    if (event.message_type !== "private") {
      await sendReply(ctx, event, "该指令仅支持私聊使用");
      return;
    }
    const userId = String(event.user_id);
    if (!pluginState.isUserAdmin(userId)) {
      await sendReply(ctx, event, "您没有权限执行此操作");
      return;
    }
    if (args.length < 2) {
      const helpText = [
        "管理员指令列表：",
        "#steam admin list - 查看管理员列表",
        "#steam admin add <QQ号> - 添加管理员",
        "#steam admin remove <QQ号> - 移除管理员",
        "#steam admin help - 显示此帮助信息"
      ].join("\n");
      await sendReply(ctx, event, helpText);
      return;
    }
    const subCommand = args[1].toLowerCase();
    switch (subCommand) {
      case "list":
        await handleAdminList(ctx, event);
        break;
      case "add":
        await handleAdminAdd(ctx, event, args);
        break;
      case "remove":
        await handleAdminRemove(ctx, event, args);
        break;
      case "help":
        const helpText = [
          "管理员指令列表：",
          "#steam admin list - 查看管理员列表",
          "#steam admin add <QQ号> - 添加管理员",
          "#steam admin remove <QQ号> - 移除管理员",
          "#steam admin help - 显示此帮助信息"
        ].join("\n");
        await sendReply(ctx, event, helpText);
        break;
      default:
        await sendReply(ctx, event, "未知的管理员指令，使用 #admin help 查看帮助");
        break;
    }
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("处理管理员指令时出错:", error);
    await sendReply(ctx, event, `处理指令失败: ${error.message}`);
  }
}
async function handleAdminList(ctx, event) {
  const adminUsers = pluginState.config.adminUsers || [];
  if (adminUsers.length === 0) {
    await sendReply(ctx, event, "当前没有设置管理员");
    return;
  }
  const adminList = adminUsers.map((admin, index) => `${index + 1}. ${admin}`).join("\n");
  await sendReply(ctx, event, `当前管理员列表：
${adminList}`);
}
async function handleAdminAdd(ctx, event, args) {
  if (args.length < 3) {
    await sendReply(ctx, event, "用法: #admin add <QQ号>");
    return;
  }
  const userIdToAdd = args[2];
  if (!userIdToAdd || isNaN(Number(userIdToAdd))) {
    await sendReply(ctx, event, "请输入有效的QQ号");
    return;
  }
  const adminUsers = [...pluginState.config.adminUsers || []];
  if (adminUsers.includes(userIdToAdd)) {
    await sendReply(ctx, event, `用户 ${userIdToAdd} 已经是管理员`);
    return;
  }
  adminUsers.push(userIdToAdd);
  pluginState.updateConfig({ adminUsers });
  await sendReply(ctx, event, `已将用户 ${userIdToAdd} 添加为管理员`);
  pluginState.logger.info(`用户 ${String(event.user_id)} 将 ${userIdToAdd} 添加为管理员`);
}
async function handleAdminRemove(ctx, event, args) {
  if (args.length < 3) {
    await sendReply(ctx, event, "用法: #admin remove <QQ号>");
    return;
  }
  const userIdToRemove = args[2];
  if (!userIdToRemove || isNaN(Number(userIdToRemove))) {
    await sendReply(ctx, event, "请输入有效的QQ号");
    return;
  }
  const adminUsers = [...pluginState.config.adminUsers || []];
  const index = adminUsers.indexOf(userIdToRemove);
  if (index === -1) {
    await sendReply(ctx, event, `用户 ${userIdToRemove} 不是管理员`);
    return;
  }
  if (adminUsers.length <= 1) {
    await sendReply(ctx, event, "无法移除最后一个管理员，至少需要保留一个管理员");
    return;
  }
  adminUsers.splice(index, 1);
  pluginState.updateConfig({ adminUsers });
  await sendReply(ctx, event, `已将用户 ${userIdToRemove} 移除管理员权限`);
  pluginState.logger.info(`用户 ${String(event.user_id)} 移除了 ${userIdToRemove} 的管理员权限`);
}

async function handleGroup(ctx, event, args) {
  try {
    if (event.message_type !== "private") {
      await sendReply(ctx, event, "该指令仅支持私聊使用");
      return;
    }
    const userId = String(event.user_id);
    if (!pluginState.isUserAdmin(userId)) {
      await sendReply(ctx, event, "您没有权限执行此操作");
      return;
    }
    if (args.length < 2) {
      const helpText = [
        "群组管理指令列表：",
        "#steam group add <群号> - 将群聊添加到白名单",
        "#steam group remove <群号> - 从白名单移除群聊",
        "#steam group list - 查看已管理的群组列表",
        "#steam group help - 显示此帮助信息"
      ].join("\n");
      await sendReply(ctx, event, helpText);
      return;
    }
    const subCommand = args[1].toLowerCase();
    switch (subCommand) {
      case "add":
        await handleGroupAdd(ctx, event, args);
        break;
      case "remove":
      case "del":
        await handleGroupRemove(ctx, event, args);
        break;
      case "list":
        await handleGroupList(ctx, event);
        break;
      case "help":
        const helpText = [
          "群组管理指令列表：",
          "#steam group add <群号> - 将群聊添加到白名单",
          "#steam group remove <群号> - 从白名单移除群聊",
          "#steam group list - 查看已管理的群组列表",
          "#steam group help - 显示此帮助信息"
        ].join("\n");
        await sendReply(ctx, event, helpText);
        break;
      default:
        await sendReply(ctx, event, "未知的群组指令，使用 #group help 查看帮助");
        break;
    }
    pluginState.incrementProcessed();
  } catch (error) {
    pluginState.logger.error("处理群组指令时出错:", error);
    await sendReply(ctx, event, `处理指令失败: ${error.message}`);
  }
}
async function handleGroupAdd(ctx, event, args) {
  if (args.length < 3) {
    await sendReply(ctx, event, "用法: #group add <群号>");
    return;
  }
  const groupId = args[2];
  if (!groupId || isNaN(Number(groupId))) {
    await sendReply(ctx, event, "请输入有效的群号");
    return;
  }
  pluginState.updateGroupConfig(groupId, { enabled: true });
  await sendReply(ctx, event, `已将群 ${groupId} 添加到白名单并启用插件功能`);
  pluginState.logger.info(`用户 ${String(event.user_id)} 将群 ${groupId} 添加到白名单`);
}
async function handleGroupRemove(ctx, event, args) {
  if (args.length < 3) {
    await sendReply(ctx, event, "用法: #group remove <群号>");
    return;
  }
  const groupId = args[2];
  if (!groupId || isNaN(Number(groupId))) {
    await sendReply(ctx, event, "请输入有效的群号");
    return;
  }
  if (!pluginState.isGroupEnabled(groupId)) {
    await sendReply(ctx, event, `群 ${groupId} 不在白名单中或已被禁用`);
    return;
  }
  pluginState.updateGroupConfig(groupId, { enabled: false });
  await sendReply(ctx, event, `已将群 ${groupId} 从白名单移除`);
  pluginState.logger.info(`用户 ${String(event.user_id)} 将群 ${groupId} 从白名单移除`);
}
async function handleGroupList(ctx, event) {
  const groupConfigs = pluginState.config.groupConfigs;
  const enabledGroups = Object.entries(groupConfigs).filter(([_, config]) => config.enabled).map(([groupId, _]) => groupId);
  if (enabledGroups.length === 0) {
    await sendReply(ctx, event, "当前没有已启用的群组");
    return;
  }
  const groupList = enabledGroups.map((groupId, index) => `${index + 1}. ${groupId}`).join("\n");
  await sendReply(ctx, event, `已启用的群组列表：
${groupList}`);
}

async function handleMessage(ctx, event) {
  try {
    const rawMessage = event.raw_message || "";
    const messageType = event.message_type;
    const groupId = event.group_id;
    const userId = event.user_id;
    pluginState.ctx.logger.debug(`收到消息: ${rawMessage} | 类型: ${messageType}`);
    if (messageType === "group" && groupId) {
      if (!pluginState.isGroupEnabled(String(groupId))) return;
    }
    const prefix = pluginState.config.commandPrefix;
    if (!rawMessage.startsWith(prefix)) return;
    const args = rawMessage.slice(prefix.length).trim().split(/\s+/);
    const mainCommand = args[0]?.toLowerCase() || "";
    switch (mainCommand) {
      case "help":
        await handleHelp(ctx, event, args);
        break;
      case "search":
        await handleSteamSearch(ctx, event, args);
        break;
      case "bind":
        await handleSteamBind(ctx, event, args);
        break;
      case "bind-batch":
        await handleSteamBindBatch(ctx, event, args);
        break;
      case "list":
        await handleSteamList(ctx, event, args);
        break;
      case "reset":
        await handleSteamReset(ctx, event, args);
        break;
      case "remove":
        await handleSteamRemove(ctx, event, args);
        break;
      case "polling":
        await handleSteamPolling(ctx, event, args);
        break;
      case "admin":
        await handleAdmin(ctx, event, args);
        break;
      case "group":
        await handleGroup(ctx, event, args);
        break;
      default:
        break;
    }
  } catch (error) {
    pluginState.logger.error("处理消息时出错:", error);
  }
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var util = {exports: {}};

var constants;
var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;
	constants = {
	    /* The local file header */
	    LOCHDR           : 30, // LOC header size
	    LOCSIG           : 0x04034b50, // "PK\003\004"
	    LOCVER           : 4,	// version needed to extract
	    LOCFLG           : 6, // general purpose bit flag
	    LOCHOW           : 8, // compression method
	    LOCTIM           : 10, // modification time (2 bytes time, 2 bytes date)
	    LOCCRC           : 14, // uncompressed file crc-32 value
	    LOCSIZ           : 18, // compressed size
	    LOCLEN           : 22, // uncompressed size
	    LOCNAM           : 26, // filename length
	    LOCEXT           : 28, // extra field length

	    /* The Data descriptor */
	    EXTSIG           : 0x08074b50, // "PK\007\008"
	    EXTHDR           : 16, // EXT header size
	    EXTCRC           : 4, // uncompressed file crc-32 value
	    EXTSIZ           : 8, // compressed size
	    EXTLEN           : 12, // uncompressed size

	    /* The central directory file header */
	    CENHDR           : 46, // CEN header size
	    CENSIG           : 0x02014b50, // "PK\001\002"
	    CENVEM           : 4, // version made by
	    CENVER           : 6, // version needed to extract
	    CENFLG           : 8, // encrypt, decrypt flags
	    CENHOW           : 10, // compression method
	    CENTIM           : 12, // modification time (2 bytes time, 2 bytes date)
	    CENCRC           : 16, // uncompressed file crc-32 value
	    CENSIZ           : 20, // compressed size
	    CENLEN           : 24, // uncompressed size
	    CENNAM           : 28, // filename length
	    CENEXT           : 30, // extra field length
	    CENCOM           : 32, // file comment length
	    CENDSK           : 34, // volume number start
	    CENATT           : 36, // internal file attributes
	    CENATX           : 38, // external file attributes (host system dependent)
	    CENOFF           : 42, // LOC header offset

	    /* The entries in the end of central directory */
	    ENDHDR           : 22, // END header size
	    ENDSIG           : 0x06054b50, // "PK\005\006"
	    ENDSUB           : 8, // number of entries on this disk
	    ENDTOT           : 10, // total number of entries
	    ENDSIZ           : 12, // central directory size in bytes
	    ENDOFF           : 16, // offset of first CEN header
	    ENDCOM           : 20, // zip file comment length

	    END64HDR         : 20, // zip64 END header size
	    END64SIG         : 0x07064b50, // zip64 Locator signature, "PK\006\007"
	    END64START       : 4, // number of the disk with the start of the zip64
	    END64OFF         : 8, // relative offset of the zip64 end of central directory
	    END64NUMDISKS    : 16, // total number of disks

	    ZIP64SIG         : 0x06064b50, // zip64 signature, "PK\006\006"
	    ZIP64HDR         : 56, // zip64 record minimum size
	    ZIP64LEAD        : 12, // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
	    ZIP64SIZE        : 4, // zip64 size of the central directory record
	    ZIP64VEM         : 12, // zip64 version made by
	    ZIP64VER         : 14, // zip64 version needed to extract
	    ZIP64DSK         : 16, // zip64 number of this disk
	    ZIP64DSKDIR      : 20, // number of the disk with the start of the record directory
	    ZIP64SUB         : 24, // number of entries on this disk
	    ZIP64TOT         : 32, // total number of entries
	    ZIP64SIZB        : 40, // zip64 central directory size in bytes
	    ZIP64OFF         : 48, // offset of start of central directory with respect to the starting disk number
	    ZIP64EXTRA       : 56, // extensible data sector

	    /* Compression methods */
	    STORED           : 0, // no compression
	    SHRUNK           : 1, // shrunk
	    REDUCED1         : 2, // reduced with compression factor 1
	    REDUCED2         : 3, // reduced with compression factor 2
	    REDUCED3         : 4, // reduced with compression factor 3
	    REDUCED4         : 5, // reduced with compression factor 4
	    IMPLODED         : 6, // imploded
	    // 7 reserved for Tokenizing compression algorithm
	    DEFLATED         : 8, // deflated
	    ENHANCED_DEFLATED: 9, // enhanced deflated
	    PKWARE           : 10,// PKWare DCL imploded
	    // 11 reserved by PKWARE
	    BZIP2            : 12, //  compressed using BZIP2
	    // 13 reserved by PKWARE
	    LZMA             : 14, // LZMA
	    // 15-17 reserved by PKWARE
	    IBM_TERSE        : 18, // compressed using IBM TERSE
	    IBM_LZ77         : 19, // IBM LZ77 z
	    AES_ENCRYPT      : 99, // WinZIP AES encryption method

	    /* General purpose bit flag */
	    // values can obtained with expression 2**bitnr
	    FLG_ENC          : 1,    // Bit 0: encrypted file
	    FLG_COMP1        : 2,    // Bit 1, compression option
	    FLG_COMP2        : 4,    // Bit 2, compression option
	    FLG_DESC         : 8,    // Bit 3, data descriptor
	    FLG_ENH          : 16,   // Bit 4, enhanced deflating
	    FLG_PATCH        : 32,   // Bit 5, indicates that the file is compressed patched data.
	    FLG_STR          : 64,   // Bit 6, strong encryption (patented)
	                             // Bits 7-10: Currently unused.
	    FLG_EFS          : 2048, // Bit 11: Language encoding flag (EFS)
	                             // Bit 12: Reserved by PKWARE for enhanced compression.
	                             // Bit 13: encrypted the Central Directory (patented).
	                             // Bits 14-15: Reserved by PKWARE.
	    FLG_MSK          : 4096, // mask header values

	    /* Load type */
	    FILE             : 2,
	    BUFFER           : 1,
	    NONE             : 0,

	    /* 4.5 Extensible data fields */
	    EF_ID            : 0,
	    EF_SIZE          : 2,

	    /* Header IDs */
	    ID_ZIP64         : 0x0001,
	    ID_AVINFO        : 0x0007,
	    ID_PFS           : 0x0008,
	    ID_OS2           : 0x0009,
	    ID_NTFS          : 0x000a,
	    ID_OPENVMS       : 0x000c,
	    ID_UNIX          : 0x000d,
	    ID_FORK          : 0x000e,
	    ID_PATCH         : 0x000f,
	    ID_X509_PKCS7    : 0x0014,
	    ID_X509_CERTID_F : 0x0015,
	    ID_X509_CERTID_C : 0x0016,
	    ID_STRONGENC     : 0x0017,
	    ID_RECORD_MGT    : 0x0018,
	    ID_X509_PKCS7_RL : 0x0019,
	    ID_IBM1          : 0x0065,
	    ID_IBM2          : 0x0066,
	    ID_POSZIP        : 0x4690,

	    EF_ZIP64_OR_32   : 0xffffffff,
	    EF_ZIP64_OR_16   : 0xffff,
	    EF_ZIP64_SUNCOMP : 0,
	    EF_ZIP64_SCOMP   : 8,
	    EF_ZIP64_RHO     : 16,
	    EF_ZIP64_DSN     : 24
	};
	return constants;
}

var errors = {};

var hasRequiredErrors;

function requireErrors () {
	if (hasRequiredErrors) return errors;
	hasRequiredErrors = 1;
	(function (exports$1) {
		const errors = {
		    /* Header error messages */
		    INVALID_LOC: "Invalid LOC header (bad signature)",
		    INVALID_CEN: "Invalid CEN header (bad signature)",
		    INVALID_END: "Invalid END header (bad signature)",

		    /* Descriptor */
		    DESCRIPTOR_NOT_EXIST: "No descriptor present",
		    DESCRIPTOR_UNKNOWN: "Unknown descriptor format",
		    DESCRIPTOR_FAULTY: "Descriptor data is malformed",

		    /* ZipEntry error messages*/
		    NO_DATA: "Nothing to decompress",
		    BAD_CRC: "CRC32 checksum failed {0}",
		    FILE_IN_THE_WAY: "There is a file in the way: {0}",
		    UNKNOWN_METHOD: "Invalid/unsupported compression method",

		    /* Inflater error messages */
		    AVAIL_DATA: "inflate::Available inflate data did not terminate",
		    INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
		    TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
		    INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
		    INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
		    INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
		    INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
		    INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
		    INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
		    INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",

		    /* ADM-ZIP error messages */
		    CANT_EXTRACT_FILE: "Could not extract the file",
		    CANT_OVERRIDE: "Target file already exists",
		    DISK_ENTRY_TOO_LARGE: "Number of disk entries is too large",
		    NO_ZIP: "No zip file was loaded",
		    NO_ENTRY: "Entry doesn't exist",
		    DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
		    FILE_NOT_FOUND: 'File not found: "{0}"',
		    NOT_IMPLEMENTED: "Not implemented",
		    INVALID_FILENAME: "Invalid filename",
		    INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",
		    INVALID_PASS_PARAM: "Incompatible password parameter",
		    WRONG_PASSWORD: "Wrong Password",

		    /* ADM-ZIP */
		    COMMENT_TOO_LONG: "Comment is too long", // Comment can be max 65535 bytes long (NOTE: some non-US characters may take more space)
		    EXTRA_FIELD_PARSE_ERROR: "Extra field parsing error"
		};

		// template
		function E(message) {
		    return function (...args) {
		        if (args.length) { // Allow {0} .. {9} arguments in error message, based on argument number
		            message = message.replace(/\{(\d)\}/g, (_, n) => args[n] || '');
		        }

		        return new Error('ADM-ZIP: ' + message);
		    };
		}

		// Init errors with template
		for (const msg of Object.keys(errors)) {
		    exports$1[msg] = E(errors[msg]);
		} 
	} (errors));
	return errors;
}

var utils;
var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;
	const fsystem = fs__default;
	const pth = path__default;
	const Constants = requireConstants();
	const Errors = requireErrors();
	const isWin = typeof process === "object" && "win32" === process.platform;

	const is_Obj = (obj) => typeof obj === "object" && obj !== null;

	// generate CRC32 lookup table
	const crcTable = new Uint32Array(256).map((t, c) => {
	    for (let k = 0; k < 8; k++) {
	        if ((c & 1) !== 0) {
	            c = 0xedb88320 ^ (c >>> 1);
	        } else {
	            c >>>= 1;
	        }
	    }
	    return c >>> 0;
	});

	// UTILS functions

	function Utils(opts) {
	    this.sep = pth.sep;
	    this.fs = fsystem;

	    if (is_Obj(opts)) {
	        // custom filesystem
	        if (is_Obj(opts.fs) && typeof opts.fs.statSync === "function") {
	            this.fs = opts.fs;
	        }
	    }
	}

	utils = Utils;

	// INSTANTIABLE functions

	Utils.prototype.makeDir = function (/*String*/ folder) {
	    const self = this;

	    // Sync - make directories tree
	    function mkdirSync(/*String*/ fpath) {
	        let resolvedPath = fpath.split(self.sep)[0];
	        fpath.split(self.sep).forEach(function (name) {
	            if (!name || name.substr(-1, 1) === ":") return;
	            resolvedPath += self.sep + name;
	            var stat;
	            try {
	                stat = self.fs.statSync(resolvedPath);
	            } catch (e) {
	                self.fs.mkdirSync(resolvedPath);
	            }
	            if (stat && stat.isFile()) throw Errors.FILE_IN_THE_WAY(`"${resolvedPath}"`);
	        });
	    }

	    mkdirSync(folder);
	};

	Utils.prototype.writeFileTo = function (/*String*/ path, /*Buffer*/ content, /*Boolean*/ overwrite, /*Number*/ attr) {
	    const self = this;
	    if (self.fs.existsSync(path)) {
	        if (!overwrite) return false; // cannot overwrite

	        var stat = self.fs.statSync(path);
	        if (stat.isDirectory()) {
	            return false;
	        }
	    }
	    var folder = pth.dirname(path);
	    if (!self.fs.existsSync(folder)) {
	        self.makeDir(folder);
	    }

	    var fd;
	    try {
	        fd = self.fs.openSync(path, "w", 0o666); // 0666
	    } catch (e) {
	        self.fs.chmodSync(path, 0o666);
	        fd = self.fs.openSync(path, "w", 0o666);
	    }
	    if (fd) {
	        try {
	            self.fs.writeSync(fd, content, 0, content.length, 0);
	        } finally {
	            self.fs.closeSync(fd);
	        }
	    }
	    self.fs.chmodSync(path, attr || 0o666);
	    return true;
	};

	Utils.prototype.writeFileToAsync = function (/*String*/ path, /*Buffer*/ content, /*Boolean*/ overwrite, /*Number*/ attr, /*Function*/ callback) {
	    if (typeof attr === "function") {
	        callback = attr;
	        attr = undefined;
	    }

	    const self = this;

	    self.fs.exists(path, function (exist) {
	        if (exist && !overwrite) return callback(false);

	        self.fs.stat(path, function (err, stat) {
	            if (exist && stat.isDirectory()) {
	                return callback(false);
	            }

	            var folder = pth.dirname(path);
	            self.fs.exists(folder, function (exists) {
	                if (!exists) self.makeDir(folder);

	                self.fs.open(path, "w", 0o666, function (err, fd) {
	                    if (err) {
	                        self.fs.chmod(path, 0o666, function () {
	                            self.fs.open(path, "w", 0o666, function (err, fd) {
	                                self.fs.write(fd, content, 0, content.length, 0, function () {
	                                    self.fs.close(fd, function () {
	                                        self.fs.chmod(path, attr || 0o666, function () {
	                                            callback(true);
	                                        });
	                                    });
	                                });
	                            });
	                        });
	                    } else if (fd) {
	                        self.fs.write(fd, content, 0, content.length, 0, function () {
	                            self.fs.close(fd, function () {
	                                self.fs.chmod(path, attr || 0o666, function () {
	                                    callback(true);
	                                });
	                            });
	                        });
	                    } else {
	                        self.fs.chmod(path, attr || 0o666, function () {
	                            callback(true);
	                        });
	                    }
	                });
	            });
	        });
	    });
	};

	Utils.prototype.findFiles = function (/*String*/ path) {
	    const self = this;

	    function findSync(/*String*/ dir, /*RegExp*/ pattern, /*Boolean*/ recursive) {
	        let files = [];
	        self.fs.readdirSync(dir).forEach(function (file) {
	            const path = pth.join(dir, file);
	            const stat = self.fs.statSync(path);

	            {
	                files.push(pth.normalize(path) + (stat.isDirectory() ? self.sep : ""));
	            }

	            if (stat.isDirectory() && recursive) files = files.concat(findSync(path, pattern, recursive));
	        });
	        return files;
	    }

	    return findSync(path, undefined, true);
	};

	/**
	 * Callback for showing if everything was done.
	 *
	 * @callback filelistCallback
	 * @param {Error} err - Error object
	 * @param {string[]} list - was request fully completed
	 */

	/**
	 *
	 * @param {string} dir
	 * @param {filelistCallback} cb
	 */
	Utils.prototype.findFilesAsync = function (dir, cb) {
	    const self = this;
	    let results = [];
	    self.fs.readdir(dir, function (err, list) {
	        if (err) return cb(err);
	        let list_length = list.length;
	        if (!list_length) return cb(null, results);
	        list.forEach(function (file) {
	            file = pth.join(dir, file);
	            self.fs.stat(file, function (err, stat) {
	                if (err) return cb(err);
	                if (stat) {
	                    results.push(pth.normalize(file) + (stat.isDirectory() ? self.sep : ""));
	                    if (stat.isDirectory()) {
	                        self.findFilesAsync(file, function (err, res) {
	                            if (err) return cb(err);
	                            results = results.concat(res);
	                            if (!--list_length) cb(null, results);
	                        });
	                    } else {
	                        if (!--list_length) cb(null, results);
	                    }
	                }
	            });
	        });
	    });
	};

	Utils.prototype.getAttributes = function () {};

	Utils.prototype.setAttributes = function () {};

	// STATIC functions

	// crc32 single update (it is part of crc32)
	Utils.crc32update = function (crc, byte) {
	    return crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	};

	Utils.crc32 = function (buf) {
	    if (typeof buf === "string") {
	        buf = Buffer.from(buf, "utf8");
	    }

	    let len = buf.length;
	    let crc = -1;
	    for (let off = 0; off < len; ) crc = Utils.crc32update(crc, buf[off++]);
	    // xor and cast as uint32 number
	    return ~crc >>> 0;
	};

	Utils.methodToString = function (/*Number*/ method) {
	    switch (method) {
	        case Constants.STORED:
	            return "STORED (" + method + ")";
	        case Constants.DEFLATED:
	            return "DEFLATED (" + method + ")";
	        default:
	            return "UNSUPPORTED (" + method + ")";
	    }
	};

	/**
	 * removes ".." style path elements
	 * @param {string} path - fixable path
	 * @returns string - fixed filepath
	 */
	Utils.canonical = function (/*string*/ path) {
	    if (!path) return "";
	    // trick normalize think path is absolute
	    const safeSuffix = pth.posix.normalize("/" + path.split("\\").join("/"));
	    return pth.join(".", safeSuffix);
	};

	/**
	 * fix file names in achive
	 * @param {string} path - fixable path
	 * @returns string - fixed filepath
	 */

	Utils.zipnamefix = function (path) {
	    if (!path) return "";
	    // trick normalize think path is absolute
	    const safeSuffix = pth.posix.normalize("/" + path.split("\\").join("/"));
	    return pth.posix.join(".", safeSuffix);
	};

	/**
	 *
	 * @param {Array} arr
	 * @param {function} callback
	 * @returns
	 */
	Utils.findLast = function (arr, callback) {
	    if (!Array.isArray(arr)) throw new TypeError("arr is not array");

	    const len = arr.length >>> 0;
	    for (let i = len - 1; i >= 0; i--) {
	        if (callback(arr[i], i, arr)) {
	            return arr[i];
	        }
	    }
	    return void 0;
	};

	// make abolute paths taking prefix as root folder
	Utils.sanitize = function (/*string*/ prefix, /*string*/ name) {
	    prefix = pth.resolve(pth.normalize(prefix));
	    var parts = name.split("/");
	    for (var i = 0, l = parts.length; i < l; i++) {
	        var path = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
	        if (path.indexOf(prefix) === 0) {
	            return path;
	        }
	    }
	    return pth.normalize(pth.join(prefix, pth.basename(name)));
	};

	// converts buffer, Uint8Array, string types to buffer
	Utils.toBuffer = function toBuffer(/*buffer, Uint8Array, string*/ input, /* function */ encoder) {
	    if (Buffer.isBuffer(input)) {
	        return input;
	    } else if (input instanceof Uint8Array) {
	        return Buffer.from(input);
	    } else {
	        // expect string all other values are invalid and return empty buffer
	        return typeof input === "string" ? encoder(input) : Buffer.alloc(0);
	    }
	};

	Utils.readBigUInt64LE = function (/*Buffer*/ buffer, /*int*/ index) {
	    var slice = Buffer.from(buffer.slice(index, index + 8));
	    slice.swap64();

	    return parseInt(`0x${slice.toString("hex")}`);
	};

	Utils.fromDOS2Date = function (val) {
	    return new Date(((val >> 25) & 0x7f) + 1980, Math.max(((val >> 21) & 0x0f) - 1, 0), Math.max((val >> 16) & 0x1f, 1), (val >> 11) & 0x1f, (val >> 5) & 0x3f, (val & 0x1f) << 1);
	};

	Utils.fromDate2DOS = function (val) {
	    let date = 0;
	    let time = 0;
	    if (val.getFullYear() > 1979) {
	        date = (((val.getFullYear() - 1980) & 0x7f) << 9) | ((val.getMonth() + 1) << 5) | val.getDate();
	        time = (val.getHours() << 11) | (val.getMinutes() << 5) | (val.getSeconds() >> 1);
	    }
	    return (date << 16) | time;
	};

	Utils.isWin = isWin; // Do we have windows system
	Utils.crcTable = crcTable;
	return utils;
}

var fattr;
var hasRequiredFattr;

function requireFattr () {
	if (hasRequiredFattr) return fattr;
	hasRequiredFattr = 1;
	const pth = path__default;

	fattr = function (/*String*/ path, /*Utils object*/ { fs }) {
	    var _path = path || "",
	        _obj = newAttr(),
	        _stat = null;

	    function newAttr() {
	        return {
	            directory: false,
	            readonly: false,
	            hidden: false,
	            executable: false,
	            mtime: 0,
	            atime: 0
	        };
	    }

	    if (_path && fs.existsSync(_path)) {
	        _stat = fs.statSync(_path);
	        _obj.directory = _stat.isDirectory();
	        _obj.mtime = _stat.mtime;
	        _obj.atime = _stat.atime;
	        _obj.executable = (0o111 & _stat.mode) !== 0; // file is executable who ever har right not just owner
	        _obj.readonly = (0o200 & _stat.mode) === 0; // readonly if owner has no write right
	        _obj.hidden = pth.basename(_path)[0] === ".";
	    } else {
	        console.warn("Invalid path: " + _path);
	    }

	    return {
	        get directory() {
	            return _obj.directory;
	        },

	        get readOnly() {
	            return _obj.readonly;
	        },

	        get hidden() {
	            return _obj.hidden;
	        },

	        get mtime() {
	            return _obj.mtime;
	        },

	        get atime() {
	            return _obj.atime;
	        },

	        get executable() {
	            return _obj.executable;
	        },

	        decodeAttributes: function () {},

	        encodeAttributes: function () {},

	        toJSON: function () {
	            return {
	                path: _path,
	                isDirectory: _obj.directory,
	                isReadOnly: _obj.readonly,
	                isHidden: _obj.hidden,
	                isExecutable: _obj.executable,
	                mTime: _obj.mtime,
	                aTime: _obj.atime
	            };
	        },

	        toString: function () {
	            return JSON.stringify(this.toJSON(), null, "\t");
	        }
	    };
	};
	return fattr;
}

var decoder;
var hasRequiredDecoder;

function requireDecoder () {
	if (hasRequiredDecoder) return decoder;
	hasRequiredDecoder = 1;
	decoder = {
	    efs: true,
	    encode: (data) => Buffer.from(data, "utf8"),
	    decode: (data) => data.toString("utf8")
	};
	return decoder;
}

var hasRequiredUtil;

function requireUtil () {
	if (hasRequiredUtil) return util.exports;
	hasRequiredUtil = 1;
	util.exports = requireUtils();
	util.exports.Constants = requireConstants();
	util.exports.Errors = requireErrors();
	util.exports.FileAttr = requireFattr();
	util.exports.decoder = requireDecoder();
	return util.exports;
}

var headers = {};

var entryHeader;
var hasRequiredEntryHeader;

function requireEntryHeader () {
	if (hasRequiredEntryHeader) return entryHeader;
	hasRequiredEntryHeader = 1;
	var Utils = requireUtil(),
	    Constants = Utils.Constants;

	/* The central directory file header */
	entryHeader = function () {
	    var _verMade = 20, // v2.0
	        _version = 10, // v1.0
	        _flags = 0,
	        _method = 0,
	        _time = 0,
	        _crc = 0,
	        _compressedSize = 0,
	        _size = 0,
	        _fnameLen = 0,
	        _extraLen = 0,
	        _comLen = 0,
	        _diskStart = 0,
	        _inattr = 0,
	        _attr = 0,
	        _offset = 0;

	    _verMade |= Utils.isWin ? 0x0a00 : 0x0300;

	    // Set EFS flag since filename and comment fields are all by default encoded using UTF-8.
	    // Without it file names may be corrupted for other apps when file names use unicode chars
	    _flags |= Constants.FLG_EFS;

	    const _localHeader = {
	        extraLen: 0
	    };

	    // casting
	    const uint32 = (val) => Math.max(0, val) >>> 0;
	    const uint8 = (val) => Math.max(0, val) & 0xff;

	    _time = Utils.fromDate2DOS(new Date());

	    return {
	        get made() {
	            return _verMade;
	        },
	        set made(val) {
	            _verMade = val;
	        },

	        get version() {
	            return _version;
	        },
	        set version(val) {
	            _version = val;
	        },

	        get flags() {
	            return _flags;
	        },
	        set flags(val) {
	            _flags = val;
	        },

	        get flags_efs() {
	            return (_flags & Constants.FLG_EFS) > 0;
	        },
	        set flags_efs(val) {
	            if (val) {
	                _flags |= Constants.FLG_EFS;
	            } else {
	                _flags &= ~Constants.FLG_EFS;
	            }
	        },

	        get flags_desc() {
	            return (_flags & Constants.FLG_DESC) > 0;
	        },
	        set flags_desc(val) {
	            if (val) {
	                _flags |= Constants.FLG_DESC;
	            } else {
	                _flags &= ~Constants.FLG_DESC;
	            }
	        },

	        get method() {
	            return _method;
	        },
	        set method(val) {
	            switch (val) {
	                case Constants.STORED:
	                    this.version = 10;
	                case Constants.DEFLATED:
	                default:
	                    this.version = 20;
	            }
	            _method = val;
	        },

	        get time() {
	            return Utils.fromDOS2Date(this.timeval);
	        },
	        set time(val) {
	            this.timeval = Utils.fromDate2DOS(val);
	        },

	        get timeval() {
	            return _time;
	        },
	        set timeval(val) {
	            _time = uint32(val);
	        },

	        get timeHighByte() {
	            return uint8(_time >>> 8);
	        },
	        get crc() {
	            return _crc;
	        },
	        set crc(val) {
	            _crc = uint32(val);
	        },

	        get compressedSize() {
	            return _compressedSize;
	        },
	        set compressedSize(val) {
	            _compressedSize = uint32(val);
	        },

	        get size() {
	            return _size;
	        },
	        set size(val) {
	            _size = uint32(val);
	        },

	        get fileNameLength() {
	            return _fnameLen;
	        },
	        set fileNameLength(val) {
	            _fnameLen = val;
	        },

	        get extraLength() {
	            return _extraLen;
	        },
	        set extraLength(val) {
	            _extraLen = val;
	        },

	        get extraLocalLength() {
	            return _localHeader.extraLen;
	        },
	        set extraLocalLength(val) {
	            _localHeader.extraLen = val;
	        },

	        get commentLength() {
	            return _comLen;
	        },
	        set commentLength(val) {
	            _comLen = val;
	        },

	        get diskNumStart() {
	            return _diskStart;
	        },
	        set diskNumStart(val) {
	            _diskStart = uint32(val);
	        },

	        get inAttr() {
	            return _inattr;
	        },
	        set inAttr(val) {
	            _inattr = uint32(val);
	        },

	        get attr() {
	            return _attr;
	        },
	        set attr(val) {
	            _attr = uint32(val);
	        },

	        // get Unix file permissions
	        get fileAttr() {
	            return (_attr || 0) >> 16 & 0xfff;
	        },

	        get offset() {
	            return _offset;
	        },
	        set offset(val) {
	            _offset = uint32(val);
	        },

	        get encrypted() {
	            return (_flags & Constants.FLG_ENC) === Constants.FLG_ENC;
	        },

	        get centralHeaderSize() {
	            return Constants.CENHDR + _fnameLen + _extraLen + _comLen;
	        },

	        get realDataOffset() {
	            return _offset + Constants.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
	        },

	        get localHeader() {
	            return _localHeader;
	        },

	        loadLocalHeaderFromBinary: function (/*Buffer*/ input) {
	            var data = input.slice(_offset, _offset + Constants.LOCHDR);
	            // 30 bytes and should start with "PK\003\004"
	            if (data.readUInt32LE(0) !== Constants.LOCSIG) {
	                throw Utils.Errors.INVALID_LOC();
	            }

	            // version needed to extract
	            _localHeader.version = data.readUInt16LE(Constants.LOCVER);
	            // general purpose bit flag
	            _localHeader.flags = data.readUInt16LE(Constants.LOCFLG);
	            // compression method
	            _localHeader.method = data.readUInt16LE(Constants.LOCHOW);
	            // modification time (2 bytes time, 2 bytes date)
	            _localHeader.time = data.readUInt32LE(Constants.LOCTIM);
	            // uncompressed file crc-32 valu
	            _localHeader.crc = data.readUInt32LE(Constants.LOCCRC);
	            // compressed size
	            _localHeader.compressedSize = data.readUInt32LE(Constants.LOCSIZ);
	            // uncompressed size
	            _localHeader.size = data.readUInt32LE(Constants.LOCLEN);
	            // filename length
	            _localHeader.fnameLen = data.readUInt16LE(Constants.LOCNAM);
	            // extra field length
	            _localHeader.extraLen = data.readUInt16LE(Constants.LOCEXT);

	            // read extra data
	            const extraStart = _offset + Constants.LOCHDR + _localHeader.fnameLen;
	            const extraEnd = extraStart + _localHeader.extraLen;
	            return input.slice(extraStart, extraEnd);
	        },

	        loadFromBinary: function (/*Buffer*/ data) {
	            // data should be 46 bytes and start with "PK 01 02"
	            if (data.length !== Constants.CENHDR || data.readUInt32LE(0) !== Constants.CENSIG) {
	                throw Utils.Errors.INVALID_CEN();
	            }
	            // version made by
	            _verMade = data.readUInt16LE(Constants.CENVEM);
	            // version needed to extract
	            _version = data.readUInt16LE(Constants.CENVER);
	            // encrypt, decrypt flags
	            _flags = data.readUInt16LE(Constants.CENFLG);
	            // compression method
	            _method = data.readUInt16LE(Constants.CENHOW);
	            // modification time (2 bytes time, 2 bytes date)
	            _time = data.readUInt32LE(Constants.CENTIM);
	            // uncompressed file crc-32 value
	            _crc = data.readUInt32LE(Constants.CENCRC);
	            // compressed size
	            _compressedSize = data.readUInt32LE(Constants.CENSIZ);
	            // uncompressed size
	            _size = data.readUInt32LE(Constants.CENLEN);
	            // filename length
	            _fnameLen = data.readUInt16LE(Constants.CENNAM);
	            // extra field length
	            _extraLen = data.readUInt16LE(Constants.CENEXT);
	            // file comment length
	            _comLen = data.readUInt16LE(Constants.CENCOM);
	            // volume number start
	            _diskStart = data.readUInt16LE(Constants.CENDSK);
	            // internal file attributes
	            _inattr = data.readUInt16LE(Constants.CENATT);
	            // external file attributes
	            _attr = data.readUInt32LE(Constants.CENATX);
	            // LOC header offset
	            _offset = data.readUInt32LE(Constants.CENOFF);
	        },

	        localHeaderToBinary: function () {
	            // LOC header size (30 bytes)
	            var data = Buffer.alloc(Constants.LOCHDR);
	            // "PK\003\004"
	            data.writeUInt32LE(Constants.LOCSIG, 0);
	            // version needed to extract
	            data.writeUInt16LE(_version, Constants.LOCVER);
	            // general purpose bit flag
	            data.writeUInt16LE(_flags, Constants.LOCFLG);
	            // compression method
	            data.writeUInt16LE(_method, Constants.LOCHOW);
	            // modification time (2 bytes time, 2 bytes date)
	            data.writeUInt32LE(_time, Constants.LOCTIM);
	            // uncompressed file crc-32 value
	            data.writeUInt32LE(_crc, Constants.LOCCRC);
	            // compressed size
	            data.writeUInt32LE(_compressedSize, Constants.LOCSIZ);
	            // uncompressed size
	            data.writeUInt32LE(_size, Constants.LOCLEN);
	            // filename length
	            data.writeUInt16LE(_fnameLen, Constants.LOCNAM);
	            // extra field length
	            data.writeUInt16LE(_localHeader.extraLen, Constants.LOCEXT);
	            return data;
	        },

	        centralHeaderToBinary: function () {
	            // CEN header size (46 bytes)
	            var data = Buffer.alloc(Constants.CENHDR + _fnameLen + _extraLen + _comLen);
	            // "PK\001\002"
	            data.writeUInt32LE(Constants.CENSIG, 0);
	            // version made by
	            data.writeUInt16LE(_verMade, Constants.CENVEM);
	            // version needed to extract
	            data.writeUInt16LE(_version, Constants.CENVER);
	            // encrypt, decrypt flags
	            data.writeUInt16LE(_flags, Constants.CENFLG);
	            // compression method
	            data.writeUInt16LE(_method, Constants.CENHOW);
	            // modification time (2 bytes time, 2 bytes date)
	            data.writeUInt32LE(_time, Constants.CENTIM);
	            // uncompressed file crc-32 value
	            data.writeUInt32LE(_crc, Constants.CENCRC);
	            // compressed size
	            data.writeUInt32LE(_compressedSize, Constants.CENSIZ);
	            // uncompressed size
	            data.writeUInt32LE(_size, Constants.CENLEN);
	            // filename length
	            data.writeUInt16LE(_fnameLen, Constants.CENNAM);
	            // extra field length
	            data.writeUInt16LE(_extraLen, Constants.CENEXT);
	            // file comment length
	            data.writeUInt16LE(_comLen, Constants.CENCOM);
	            // volume number start
	            data.writeUInt16LE(_diskStart, Constants.CENDSK);
	            // internal file attributes
	            data.writeUInt16LE(_inattr, Constants.CENATT);
	            // external file attributes
	            data.writeUInt32LE(_attr, Constants.CENATX);
	            // LOC header offset
	            data.writeUInt32LE(_offset, Constants.CENOFF);
	            return data;
	        },

	        toJSON: function () {
	            const bytes = function (nr) {
	                return nr + " bytes";
	            };

	            return {
	                made: _verMade,
	                version: _version,
	                flags: _flags,
	                method: Utils.methodToString(_method),
	                time: this.time,
	                crc: "0x" + _crc.toString(16).toUpperCase(),
	                compressedSize: bytes(_compressedSize),
	                size: bytes(_size),
	                fileNameLength: bytes(_fnameLen),
	                extraLength: bytes(_extraLen),
	                commentLength: bytes(_comLen),
	                diskNumStart: _diskStart,
	                inAttr: _inattr,
	                attr: _attr,
	                offset: _offset,
	                centralHeaderSize: bytes(Constants.CENHDR + _fnameLen + _extraLen + _comLen)
	            };
	        },

	        toString: function () {
	            return JSON.stringify(this.toJSON(), null, "\t");
	        }
	    };
	};
	return entryHeader;
}

var mainHeader;
var hasRequiredMainHeader;

function requireMainHeader () {
	if (hasRequiredMainHeader) return mainHeader;
	hasRequiredMainHeader = 1;
	var Utils = requireUtil(),
	    Constants = Utils.Constants;

	/* The entries in the end of central directory */
	mainHeader = function () {
	    var _volumeEntries = 0,
	        _totalEntries = 0,
	        _size = 0,
	        _offset = 0,
	        _commentLength = 0;

	    return {
	        get diskEntries() {
	            return _volumeEntries;
	        },
	        set diskEntries(/*Number*/ val) {
	            _volumeEntries = _totalEntries = val;
	        },

	        get totalEntries() {
	            return _totalEntries;
	        },
	        set totalEntries(/*Number*/ val) {
	            _totalEntries = _volumeEntries = val;
	        },

	        get size() {
	            return _size;
	        },
	        set size(/*Number*/ val) {
	            _size = val;
	        },

	        get offset() {
	            return _offset;
	        },
	        set offset(/*Number*/ val) {
	            _offset = val;
	        },

	        get commentLength() {
	            return _commentLength;
	        },
	        set commentLength(/*Number*/ val) {
	            _commentLength = val;
	        },

	        get mainHeaderSize() {
	            return Constants.ENDHDR + _commentLength;
	        },

	        loadFromBinary: function (/*Buffer*/ data) {
	            // data should be 22 bytes and start with "PK 05 06"
	            // or be 56+ bytes and start with "PK 06 06" for Zip64
	            if (
	                (data.length !== Constants.ENDHDR || data.readUInt32LE(0) !== Constants.ENDSIG) &&
	                (data.length < Constants.ZIP64HDR || data.readUInt32LE(0) !== Constants.ZIP64SIG)
	            ) {
	                throw Utils.Errors.INVALID_END();
	            }

	            if (data.readUInt32LE(0) === Constants.ENDSIG) {
	                // number of entries on this volume
	                _volumeEntries = data.readUInt16LE(Constants.ENDSUB);
	                // total number of entries
	                _totalEntries = data.readUInt16LE(Constants.ENDTOT);
	                // central directory size in bytes
	                _size = data.readUInt32LE(Constants.ENDSIZ);
	                // offset of first CEN header
	                _offset = data.readUInt32LE(Constants.ENDOFF);
	                // zip file comment length
	                _commentLength = data.readUInt16LE(Constants.ENDCOM);
	            } else {
	                // number of entries on this volume
	                _volumeEntries = Utils.readBigUInt64LE(data, Constants.ZIP64SUB);
	                // total number of entries
	                _totalEntries = Utils.readBigUInt64LE(data, Constants.ZIP64TOT);
	                // central directory size in bytes
	                _size = Utils.readBigUInt64LE(data, Constants.ZIP64SIZE);
	                // offset of first CEN header
	                _offset = Utils.readBigUInt64LE(data, Constants.ZIP64OFF);

	                _commentLength = 0;
	            }
	        },

	        toBinary: function () {
	            var b = Buffer.alloc(Constants.ENDHDR + _commentLength);
	            // "PK 05 06" signature
	            b.writeUInt32LE(Constants.ENDSIG, 0);
	            b.writeUInt32LE(0, 4);
	            // number of entries on this volume
	            b.writeUInt16LE(_volumeEntries, Constants.ENDSUB);
	            // total number of entries
	            b.writeUInt16LE(_totalEntries, Constants.ENDTOT);
	            // central directory size in bytes
	            b.writeUInt32LE(_size, Constants.ENDSIZ);
	            // offset of first CEN header
	            b.writeUInt32LE(_offset, Constants.ENDOFF);
	            // zip file comment length
	            b.writeUInt16LE(_commentLength, Constants.ENDCOM);
	            // fill comment memory with spaces so no garbage is left there
	            b.fill(" ", Constants.ENDHDR);

	            return b;
	        },

	        toJSON: function () {
	            // creates 0x0000 style output
	            const offset = function (nr, len) {
	                let offs = nr.toString(16).toUpperCase();
	                while (offs.length < len) offs = "0" + offs;
	                return "0x" + offs;
	            };

	            return {
	                diskEntries: _volumeEntries,
	                totalEntries: _totalEntries,
	                size: _size + " bytes",
	                offset: offset(_offset, 4),
	                commentLength: _commentLength
	            };
	        },

	        toString: function () {
	            return JSON.stringify(this.toJSON(), null, "\t");
	        }
	    };
	};
	// Misspelled
	return mainHeader;
}

var hasRequiredHeaders;

function requireHeaders () {
	if (hasRequiredHeaders) return headers;
	hasRequiredHeaders = 1;
	headers.EntryHeader = requireEntryHeader();
	headers.MainHeader = requireMainHeader();
	return headers;
}

var methods = {};

var deflater;
var hasRequiredDeflater;

function requireDeflater () {
	if (hasRequiredDeflater) return deflater;
	hasRequiredDeflater = 1;
	deflater = function (/*Buffer*/ inbuf) {
	    var zlib = require$$0;

	    var opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };

	    return {
	        deflate: function () {
	            return zlib.deflateRawSync(inbuf, opts);
	        },

	        deflateAsync: function (/*Function*/ callback) {
	            var tmp = zlib.createDeflateRaw(opts),
	                parts = [],
	                total = 0;
	            tmp.on("data", function (data) {
	                parts.push(data);
	                total += data.length;
	            });
	            tmp.on("end", function () {
	                var buf = Buffer.alloc(total),
	                    written = 0;
	                buf.fill(0);
	                for (var i = 0; i < parts.length; i++) {
	                    var part = parts[i];
	                    part.copy(buf, written);
	                    written += part.length;
	                }
	                callback && callback(buf);
	            });
	            tmp.end(inbuf);
	        }
	    };
	};
	return deflater;
}

var inflater;
var hasRequiredInflater;

function requireInflater () {
	if (hasRequiredInflater) return inflater;
	hasRequiredInflater = 1;
	const version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;

	inflater = function (/*Buffer*/ inbuf, /*number*/ expectedLength) {
	    var zlib = require$$0;
	    const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};

	    return {
	        inflate: function () {
	            return zlib.inflateRawSync(inbuf, option);
	        },

	        inflateAsync: function (/*Function*/ callback) {
	            var tmp = zlib.createInflateRaw(option),
	                parts = [],
	                total = 0;
	            tmp.on("data", function (data) {
	                parts.push(data);
	                total += data.length;
	            });
	            tmp.on("end", function () {
	                var buf = Buffer.alloc(total),
	                    written = 0;
	                buf.fill(0);
	                for (var i = 0; i < parts.length; i++) {
	                    var part = parts[i];
	                    part.copy(buf, written);
	                    written += part.length;
	                }
	                callback && callback(buf);
	            });
	            tmp.end(inbuf);
	        }
	    };
	};
	return inflater;
}

var zipcrypto;
var hasRequiredZipcrypto;

function requireZipcrypto () {
	if (hasRequiredZipcrypto) return zipcrypto;
	hasRequiredZipcrypto = 1;

	// node crypt, we use it for generate salt
	// eslint-disable-next-line node/no-unsupported-features/node-builtins
	const { randomFillSync } = require$$0$1;
	const Errors = requireErrors();

	// generate CRC32 lookup table
	const crctable = new Uint32Array(256).map((t, crc) => {
	    for (let j = 0; j < 8; j++) {
	        if (0 !== (crc & 1)) {
	            crc = (crc >>> 1) ^ 0xedb88320;
	        } else {
	            crc >>>= 1;
	        }
	    }
	    return crc >>> 0;
	});

	// C-style uInt32 Multiply (discards higher bits, when JS multiply discards lower bits)
	const uMul = (a, b) => Math.imul(a, b) >>> 0;

	// crc32 byte single update (actually same function is part of utils.crc32 function :) )
	const crc32update = (pCrc32, bval) => {
	    return crctable[(pCrc32 ^ bval) & 0xff] ^ (pCrc32 >>> 8);
	};

	// function for generating salt for encrytion header
	const genSalt = () => {
	    if ("function" === typeof randomFillSync) {
	        return randomFillSync(Buffer.alloc(12));
	    } else {
	        // fallback if function is not defined
	        return genSalt.node();
	    }
	};

	// salt generation with node random function (mainly as fallback)
	genSalt.node = () => {
	    const salt = Buffer.alloc(12);
	    const len = salt.length;
	    for (let i = 0; i < len; i++) salt[i] = (Math.random() * 256) & 0xff;
	    return salt;
	};

	// general config
	const config = {
	    genSalt
	};

	// Class Initkeys handles same basic ops with keys
	function Initkeys(pw) {
	    const pass = Buffer.isBuffer(pw) ? pw : Buffer.from(pw);
	    this.keys = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
	    for (let i = 0; i < pass.length; i++) {
	        this.updateKeys(pass[i]);
	    }
	}

	Initkeys.prototype.updateKeys = function (byteValue) {
	    const keys = this.keys;
	    keys[0] = crc32update(keys[0], byteValue);
	    keys[1] += keys[0] & 0xff;
	    keys[1] = uMul(keys[1], 134775813) + 1;
	    keys[2] = crc32update(keys[2], keys[1] >>> 24);
	    return byteValue;
	};

	Initkeys.prototype.next = function () {
	    const k = (this.keys[2] | 2) >>> 0; // key
	    return (uMul(k, k ^ 1) >> 8) & 0xff; // decode
	};

	function make_decrypter(/*Buffer*/ pwd) {
	    // 1. Stage initialize key
	    const keys = new Initkeys(pwd);

	    // return decrypter function
	    return function (/*Buffer*/ data) {
	        // result - we create new Buffer for results
	        const result = Buffer.alloc(data.length);
	        let pos = 0;
	        // process input data
	        for (let c of data) {
	            //c ^= keys.next();
	            //result[pos++] = c; // decode & Save Value
	            result[pos++] = keys.updateKeys(c ^ keys.next()); // update keys with decoded byte
	        }
	        return result;
	    };
	}

	function make_encrypter(/*Buffer*/ pwd) {
	    // 1. Stage initialize key
	    const keys = new Initkeys(pwd);

	    // return encrypting function, result and pos is here so we dont have to merge buffers later
	    return function (/*Buffer*/ data, /*Buffer*/ result, /* Number */ pos = 0) {
	        // result - we create new Buffer for results
	        if (!result) result = Buffer.alloc(data.length);
	        // process input data
	        for (let c of data) {
	            const k = keys.next(); // save key byte
	            result[pos++] = c ^ k; // save val
	            keys.updateKeys(c); // update keys with decoded byte
	        }
	        return result;
	    };
	}

	function decrypt(/*Buffer*/ data, /*Object*/ header, /*String, Buffer*/ pwd) {
	    if (!data || !Buffer.isBuffer(data) || data.length < 12) {
	        return Buffer.alloc(0);
	    }

	    // 1. We Initialize and generate decrypting function
	    const decrypter = make_decrypter(pwd);

	    // 2. decrypt salt what is always 12 bytes and is a part of file content
	    const salt = decrypter(data.slice(0, 12));

	    // if bit 3 (0x08) of the general-purpose flags field is set, check salt[11] with the high byte of the header time
	    // 2 byte data block (as per Info-Zip spec), otherwise check with the high byte of the header entry
	    const verifyByte = (header.flags & 0x8) === 0x8 ? header.timeHighByte : header.crc >>> 24;

	    //3. does password meet expectations
	    if (salt[11] !== verifyByte) {
	        throw Errors.WRONG_PASSWORD();
	    }

	    // 4. decode content
	    return decrypter(data.slice(12));
	}

	// lets add way to populate salt, NOT RECOMMENDED for production but maybe useful for testing general functionality
	function _salter(data) {
	    if (Buffer.isBuffer(data) && data.length >= 12) {
	        // be aware - currently salting buffer data is modified
	        config.genSalt = function () {
	            return data.slice(0, 12);
	        };
	    } else if (data === "node") {
	        // test salt generation with node random function
	        config.genSalt = genSalt.node;
	    } else {
	        // if value is not acceptable config gets reset.
	        config.genSalt = genSalt;
	    }
	}

	function encrypt(/*Buffer*/ data, /*Object*/ header, /*String, Buffer*/ pwd, /*Boolean*/ oldlike = false) {
	    // 1. test data if data is not Buffer we make buffer from it
	    if (data == null) data = Buffer.alloc(0);
	    // if data is not buffer be make buffer from it
	    if (!Buffer.isBuffer(data)) data = Buffer.from(data.toString());

	    // 2. We Initialize and generate encrypting function
	    const encrypter = make_encrypter(pwd);

	    // 3. generate salt (12-bytes of random data)
	    const salt = config.genSalt();
	    salt[11] = (header.crc >>> 24) & 0xff;

	    // old implementations (before PKZip 2.04g) used two byte check
	    if (oldlike) salt[10] = (header.crc >>> 16) & 0xff;

	    // 4. create output
	    const result = Buffer.alloc(data.length + 12);
	    encrypter(salt, result);

	    // finally encode content
	    return encrypter(data, result, 12);
	}

	zipcrypto = { decrypt, encrypt, _salter };
	return zipcrypto;
}

var hasRequiredMethods;

function requireMethods () {
	if (hasRequiredMethods) return methods;
	hasRequiredMethods = 1;
	methods.Deflater = requireDeflater();
	methods.Inflater = requireInflater();
	methods.ZipCrypto = requireZipcrypto();
	return methods;
}

var zipEntry;
var hasRequiredZipEntry;

function requireZipEntry () {
	if (hasRequiredZipEntry) return zipEntry;
	hasRequiredZipEntry = 1;
	var Utils = requireUtil(),
	    Headers = requireHeaders(),
	    Constants = Utils.Constants,
	    Methods = requireMethods();

	zipEntry = function (/** object */ options, /*Buffer*/ input) {
	    var _centralHeader = new Headers.EntryHeader(),
	        _entryName = Buffer.alloc(0),
	        _comment = Buffer.alloc(0),
	        _isDirectory = false,
	        uncompressedData = null,
	        _extra = Buffer.alloc(0),
	        _extralocal = Buffer.alloc(0),
	        _efs = true;

	    // assign options
	    const opts = options;

	    const decoder = typeof opts.decoder === "object" ? opts.decoder : Utils.decoder;
	    _efs = decoder.hasOwnProperty("efs") ? decoder.efs : false;

	    function getCompressedDataFromZip() {
	        //if (!input || !Buffer.isBuffer(input)) {
	        if (!input || !(input instanceof Uint8Array)) {
	            return Buffer.alloc(0);
	        }
	        _extralocal = _centralHeader.loadLocalHeaderFromBinary(input);
	        return input.slice(_centralHeader.realDataOffset, _centralHeader.realDataOffset + _centralHeader.compressedSize);
	    }

	    function crc32OK(data) {
	        // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the local header is written
	        if (!_centralHeader.flags_desc) {
	            if (Utils.crc32(data) !== _centralHeader.localHeader.crc) {
	                return false;
	            }
	        } else {
	            const descriptor = {};
	            const dataEndOffset = _centralHeader.realDataOffset + _centralHeader.compressedSize;
	            // no descriptor after compressed data, instead new local header
	            if (input.readUInt32LE(dataEndOffset) == Constants.LOCSIG || input.readUInt32LE(dataEndOffset) == Constants.CENSIG) {
	                throw Utils.Errors.DESCRIPTOR_NOT_EXIST();
	            }

	            // get decriptor data
	            if (input.readUInt32LE(dataEndOffset) == Constants.EXTSIG) {
	                // descriptor with signature
	                descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC);
	                descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ);
	                descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN);
	            } else if (input.readUInt16LE(dataEndOffset + 12) === 0x4b50) {
	                // descriptor without signature (we check is new header starting where we expect)
	                descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC - 4);
	                descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ - 4);
	                descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN - 4);
	            } else {
	                throw Utils.Errors.DESCRIPTOR_UNKNOWN();
	            }

	            // check data integrity
	            if (descriptor.compressedSize !== _centralHeader.compressedSize || descriptor.size !== _centralHeader.size || descriptor.crc !== _centralHeader.crc) {
	                throw Utils.Errors.DESCRIPTOR_FAULTY();
	            }
	            if (Utils.crc32(data) !== descriptor.crc) {
	                return false;
	            }

	            // @TODO: zip64 bit descriptor fields
	            // if bit 3 is set and any value in local header "zip64 Extended information" extra field are set 0 (place holder)
	            // then 64-bit descriptor format is used instead of 32-bit
	            // central header - "zip64 Extended information" extra field should store real values and not place holders
	        }
	        return true;
	    }

	    function decompress(/*Boolean*/ async, /*Function*/ callback, /*String, Buffer*/ pass) {
	        if (typeof callback === "undefined" && typeof async === "string") {
	            pass = async;
	            async = void 0;
	        }
	        if (_isDirectory) {
	            if (async && callback) {
	                callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR()); //si added error.
	            }
	            return Buffer.alloc(0);
	        }

	        var compressedData = getCompressedDataFromZip();

	        if (compressedData.length === 0) {
	            // File is empty, nothing to decompress.
	            if (async && callback) callback(compressedData);
	            return compressedData;
	        }

	        if (_centralHeader.encrypted) {
	            if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
	                throw Utils.Errors.INVALID_PASS_PARAM();
	            }
	            compressedData = Methods.ZipCrypto.decrypt(compressedData, _centralHeader, pass);
	        }

	        var data = Buffer.alloc(_centralHeader.size);

	        switch (_centralHeader.method) {
	            case Utils.Constants.STORED:
	                compressedData.copy(data);
	                if (!crc32OK(data)) {
	                    if (async && callback) callback(data, Utils.Errors.BAD_CRC()); //si added error
	                    throw Utils.Errors.BAD_CRC();
	                } else {
	                    //si added otherwise did not seem to return data.
	                    if (async && callback) callback(data);
	                    return data;
	                }
	            case Utils.Constants.DEFLATED:
	                var inflater = new Methods.Inflater(compressedData, _centralHeader.size);
	                if (!async) {
	                    const result = inflater.inflate(data);
	                    result.copy(data, 0);
	                    if (!crc32OK(data)) {
	                        throw Utils.Errors.BAD_CRC(`"${decoder.decode(_entryName)}"`);
	                    }
	                    return data;
	                } else {
	                    inflater.inflateAsync(function (result) {
	                        result.copy(result, 0);
	                        if (callback) {
	                            if (!crc32OK(result)) {
	                                callback(result, Utils.Errors.BAD_CRC()); //si added error
	                            } else {
	                                callback(result);
	                            }
	                        }
	                    });
	                }
	                break;
	            default:
	                if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD());
	                throw Utils.Errors.UNKNOWN_METHOD();
	        }
	    }

	    function compress(/*Boolean*/ async, /*Function*/ callback) {
	        if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
	            // no data set or the data wasn't changed to require recompression
	            if (async && callback) callback(getCompressedDataFromZip());
	            return getCompressedDataFromZip();
	        }

	        if (uncompressedData.length && !_isDirectory) {
	            var compressedData;
	            // Local file header
	            switch (_centralHeader.method) {
	                case Utils.Constants.STORED:
	                    _centralHeader.compressedSize = _centralHeader.size;

	                    compressedData = Buffer.alloc(uncompressedData.length);
	                    uncompressedData.copy(compressedData);

	                    if (async && callback) callback(compressedData);
	                    return compressedData;
	                default:
	                case Utils.Constants.DEFLATED:
	                    var deflater = new Methods.Deflater(uncompressedData);
	                    if (!async) {
	                        var deflated = deflater.deflate();
	                        _centralHeader.compressedSize = deflated.length;
	                        return deflated;
	                    } else {
	                        deflater.deflateAsync(function (data) {
	                            compressedData = Buffer.alloc(data.length);
	                            _centralHeader.compressedSize = data.length;
	                            data.copy(compressedData);
	                            callback && callback(compressedData);
	                        });
	                    }
	                    deflater = null;
	                    break;
	            }
	        } else if (async && callback) {
	            callback(Buffer.alloc(0));
	        } else {
	            return Buffer.alloc(0);
	        }
	    }

	    function readUInt64LE(buffer, offset) {
	        return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
	    }

	    function parseExtra(data) {
	        try {
	            var offset = 0;
	            var signature, size, part;
	            while (offset + 4 < data.length) {
	                signature = data.readUInt16LE(offset);
	                offset += 2;
	                size = data.readUInt16LE(offset);
	                offset += 2;
	                part = data.slice(offset, offset + size);
	                offset += size;
	                if (Constants.ID_ZIP64 === signature) {
	                    parseZip64ExtendedInformation(part);
	                }
	            }
	        } catch (error) {
	            throw Utils.Errors.EXTRA_FIELD_PARSE_ERROR();
	        }
	    }

	    //Override header field values with values from the ZIP64 extra field
	    function parseZip64ExtendedInformation(data) {
	        var size, compressedSize, offset, diskNumStart;

	        if (data.length >= Constants.EF_ZIP64_SCOMP) {
	            size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
	            if (_centralHeader.size === Constants.EF_ZIP64_OR_32) {
	                _centralHeader.size = size;
	            }
	        }
	        if (data.length >= Constants.EF_ZIP64_RHO) {
	            compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
	            if (_centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
	                _centralHeader.compressedSize = compressedSize;
	            }
	        }
	        if (data.length >= Constants.EF_ZIP64_DSN) {
	            offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
	            if (_centralHeader.offset === Constants.EF_ZIP64_OR_32) {
	                _centralHeader.offset = offset;
	            }
	        }
	        if (data.length >= Constants.EF_ZIP64_DSN + 4) {
	            diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
	            if (_centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
	                _centralHeader.diskNumStart = diskNumStart;
	            }
	        }
	    }

	    return {
	        get entryName() {
	            return decoder.decode(_entryName);
	        },
	        get rawEntryName() {
	            return _entryName;
	        },
	        set entryName(val) {
	            _entryName = Utils.toBuffer(val, decoder.encode);
	            var lastChar = _entryName[_entryName.length - 1];
	            _isDirectory = lastChar === 47 || lastChar === 92;
	            _centralHeader.fileNameLength = _entryName.length;
	        },

	        get efs() {
	            if (typeof _efs === "function") {
	                return _efs(this.entryName);
	            } else {
	                return _efs;
	            }
	        },

	        get extra() {
	            return _extra;
	        },
	        set extra(val) {
	            _extra = val;
	            _centralHeader.extraLength = val.length;
	            parseExtra(val);
	        },

	        get comment() {
	            return decoder.decode(_comment);
	        },
	        set comment(val) {
	            _comment = Utils.toBuffer(val, decoder.encode);
	            _centralHeader.commentLength = _comment.length;
	            if (_comment.length > 0xffff) throw Utils.Errors.COMMENT_TOO_LONG();
	        },

	        get name() {
	            var n = decoder.decode(_entryName);
	            return _isDirectory
	                ? n
	                      .substr(n.length - 1)
	                      .split("/")
	                      .pop()
	                : n.split("/").pop();
	        },
	        get isDirectory() {
	            return _isDirectory;
	        },

	        getCompressedData: function () {
	            return compress(false, null);
	        },

	        getCompressedDataAsync: function (/*Function*/ callback) {
	            compress(true, callback);
	        },

	        setData: function (value) {
	            uncompressedData = Utils.toBuffer(value, Utils.decoder.encode);
	            if (!_isDirectory && uncompressedData.length) {
	                _centralHeader.size = uncompressedData.length;
	                _centralHeader.method = Utils.Constants.DEFLATED;
	                _centralHeader.crc = Utils.crc32(value);
	                _centralHeader.changed = true;
	            } else {
	                // folders and blank files should be stored
	                _centralHeader.method = Utils.Constants.STORED;
	            }
	        },

	        getData: function (pass) {
	            if (_centralHeader.changed) {
	                return uncompressedData;
	            } else {
	                return decompress(false, null, pass);
	            }
	        },

	        getDataAsync: function (/*Function*/ callback, pass) {
	            if (_centralHeader.changed) {
	                callback(uncompressedData);
	            } else {
	                decompress(true, callback, pass);
	            }
	        },

	        set attr(attr) {
	            _centralHeader.attr = attr;
	        },
	        get attr() {
	            return _centralHeader.attr;
	        },

	        set header(/*Buffer*/ data) {
	            _centralHeader.loadFromBinary(data);
	        },

	        get header() {
	            return _centralHeader;
	        },

	        packCentralHeader: function () {
	            _centralHeader.flags_efs = this.efs;
	            _centralHeader.extraLength = _extra.length;
	            // 1. create header (buffer)
	            var header = _centralHeader.centralHeaderToBinary();
	            var addpos = Utils.Constants.CENHDR;
	            // 2. add file name
	            _entryName.copy(header, addpos);
	            addpos += _entryName.length;
	            // 3. add extra data
	            _extra.copy(header, addpos);
	            addpos += _centralHeader.extraLength;
	            // 4. add file comment
	            _comment.copy(header, addpos);
	            return header;
	        },

	        packLocalHeader: function () {
	            let addpos = 0;
	            _centralHeader.flags_efs = this.efs;
	            _centralHeader.extraLocalLength = _extralocal.length;
	            // 1. construct local header Buffer
	            const localHeaderBuf = _centralHeader.localHeaderToBinary();
	            // 2. localHeader - crate header buffer
	            const localHeader = Buffer.alloc(localHeaderBuf.length + _entryName.length + _centralHeader.extraLocalLength);
	            // 2.1 add localheader
	            localHeaderBuf.copy(localHeader, addpos);
	            addpos += localHeaderBuf.length;
	            // 2.2 add file name
	            _entryName.copy(localHeader, addpos);
	            addpos += _entryName.length;
	            // 2.3 add extra field
	            _extralocal.copy(localHeader, addpos);
	            addpos += _extralocal.length;

	            return localHeader;
	        },

	        toJSON: function () {
	            const bytes = function (nr) {
	                return "<" + ((nr && nr.length + " bytes buffer") || "null") + ">";
	            };

	            return {
	                entryName: this.entryName,
	                name: this.name,
	                comment: this.comment,
	                isDirectory: this.isDirectory,
	                header: _centralHeader.toJSON(),
	                compressedData: bytes(input),
	                data: bytes(uncompressedData)
	            };
	        },

	        toString: function () {
	            return JSON.stringify(this.toJSON(), null, "\t");
	        }
	    };
	};
	return zipEntry;
}

var zipFile;
var hasRequiredZipFile;

function requireZipFile () {
	if (hasRequiredZipFile) return zipFile;
	hasRequiredZipFile = 1;
	const ZipEntry = requireZipEntry();
	const Headers = requireHeaders();
	const Utils = requireUtil();

	zipFile = function (/*Buffer|null*/ inBuffer, /** object */ options) {
	    var entryList = [],
	        entryTable = {},
	        _comment = Buffer.alloc(0),
	        mainHeader = new Headers.MainHeader(),
	        loadedEntries = false;
	    const temporary = new Set();

	    // assign options
	    const opts = options;

	    const { noSort, decoder } = opts;

	    if (inBuffer) {
	        // is a memory buffer
	        readMainHeader(opts.readEntries);
	    } else {
	        // none. is a new file
	        loadedEntries = true;
	    }

	    function makeTemporaryFolders() {
	        const foldersList = new Set();

	        // Make list of all folders in file
	        for (const elem of Object.keys(entryTable)) {
	            const elements = elem.split("/");
	            elements.pop(); // filename
	            if (!elements.length) continue; // no folders
	            for (let i = 0; i < elements.length; i++) {
	                const sub = elements.slice(0, i + 1).join("/") + "/";
	                foldersList.add(sub);
	            }
	        }

	        // create missing folders as temporary
	        for (const elem of foldersList) {
	            if (!(elem in entryTable)) {
	                const tempfolder = new ZipEntry(opts);
	                tempfolder.entryName = elem;
	                tempfolder.attr = 0x10;
	                tempfolder.temporary = true;
	                entryList.push(tempfolder);
	                entryTable[tempfolder.entryName] = tempfolder;
	                temporary.add(tempfolder);
	            }
	        }
	    }

	    function readEntries() {
	        loadedEntries = true;
	        entryTable = {};
	        if (mainHeader.diskEntries > (inBuffer.length - mainHeader.offset) / Utils.Constants.CENHDR) {
	            throw Utils.Errors.DISK_ENTRY_TOO_LARGE();
	        }
	        entryList = new Array(mainHeader.diskEntries); // total number of entries
	        var index = mainHeader.offset; // offset of first CEN header
	        for (var i = 0; i < entryList.length; i++) {
	            var tmp = index,
	                entry = new ZipEntry(opts, inBuffer);
	            entry.header = inBuffer.slice(tmp, (tmp += Utils.Constants.CENHDR));

	            entry.entryName = inBuffer.slice(tmp, (tmp += entry.header.fileNameLength));

	            if (entry.header.extraLength) {
	                entry.extra = inBuffer.slice(tmp, (tmp += entry.header.extraLength));
	            }

	            if (entry.header.commentLength) entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);

	            index += entry.header.centralHeaderSize;

	            entryList[i] = entry;
	            entryTable[entry.entryName] = entry;
	        }
	        temporary.clear();
	        makeTemporaryFolders();
	    }

	    function readMainHeader(/*Boolean*/ readNow) {
	        var i = inBuffer.length - Utils.Constants.ENDHDR, // END header size
	            max = Math.max(0, i - 0xffff), // 0xFFFF is the max zip file comment length
	            n = max,
	            endStart = inBuffer.length,
	            endOffset = -1, // Start offset of the END header
	            commentEnd = 0;

	        // option to search header form entire file
	        const trailingSpace = typeof opts.trailingSpace === "boolean" ? opts.trailingSpace : false;
	        if (trailingSpace) max = 0;

	        for (i; i >= n; i--) {
	            if (inBuffer[i] !== 0x50) continue; // quick check that the byte is 'P'
	            if (inBuffer.readUInt32LE(i) === Utils.Constants.ENDSIG) {
	                // "PK\005\006"
	                endOffset = i;
	                commentEnd = i;
	                endStart = i + Utils.Constants.ENDHDR;
	                // We already found a regular signature, let's look just a bit further to check if there's any zip64 signature
	                n = i - Utils.Constants.END64HDR;
	                continue;
	            }

	            if (inBuffer.readUInt32LE(i) === Utils.Constants.END64SIG) {
	                // Found a zip64 signature, let's continue reading the whole zip64 record
	                n = max;
	                continue;
	            }

	            if (inBuffer.readUInt32LE(i) === Utils.Constants.ZIP64SIG) {
	                // Found the zip64 record, let's determine it's size
	                endOffset = i;
	                endStart = i + Utils.readBigUInt64LE(inBuffer, i + Utils.Constants.ZIP64SIZE) + Utils.Constants.ZIP64LEAD;
	                break;
	            }
	        }

	        if (endOffset == -1) throw Utils.Errors.INVALID_FORMAT();

	        mainHeader.loadFromBinary(inBuffer.slice(endOffset, endStart));
	        if (mainHeader.commentLength) {
	            _comment = inBuffer.slice(commentEnd + Utils.Constants.ENDHDR);
	        }
	        if (readNow) readEntries();
	    }

	    function sortEntries() {
	        if (entryList.length > 1 && !noSort) {
	            entryList.sort((a, b) => a.entryName.toLowerCase().localeCompare(b.entryName.toLowerCase()));
	        }
	    }

	    return {
	        /**
	         * Returns an array of ZipEntry objects existent in the current opened archive
	         * @return Array
	         */
	        get entries() {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            return entryList.filter((e) => !temporary.has(e));
	        },

	        /**
	         * Archive comment
	         * @return {String}
	         */
	        get comment() {
	            return decoder.decode(_comment);
	        },
	        set comment(val) {
	            _comment = Utils.toBuffer(val, decoder.encode);
	            mainHeader.commentLength = _comment.length;
	        },

	        getEntryCount: function () {
	            if (!loadedEntries) {
	                return mainHeader.diskEntries;
	            }

	            return entryList.length;
	        },

	        forEach: function (callback) {
	            this.entries.forEach(callback);
	        },

	        /**
	         * Returns a reference to the entry with the given name or null if entry is inexistent
	         *
	         * @param entryName
	         * @return ZipEntry
	         */
	        getEntry: function (/*String*/ entryName) {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            return entryTable[entryName] || null;
	        },

	        /**
	         * Adds the given entry to the entry list
	         *
	         * @param entry
	         */
	        setEntry: function (/*ZipEntry*/ entry) {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            entryList.push(entry);
	            entryTable[entry.entryName] = entry;
	            mainHeader.totalEntries = entryList.length;
	        },

	        /**
	         * Removes the file with the given name from the entry list.
	         *
	         * If the entry is a directory, then all nested files and directories will be removed
	         * @param entryName
	         * @returns {void}
	         */
	        deleteFile: function (/*String*/ entryName, withsubfolders = true) {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            const entry = entryTable[entryName];
	            const list = this.getEntryChildren(entry, withsubfolders).map((child) => child.entryName);

	            list.forEach(this.deleteEntry);
	        },

	        /**
	         * Removes the entry with the given name from the entry list.
	         *
	         * @param {string} entryName
	         * @returns {void}
	         */
	        deleteEntry: function (/*String*/ entryName) {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            const entry = entryTable[entryName];
	            const index = entryList.indexOf(entry);
	            if (index >= 0) {
	                entryList.splice(index, 1);
	                delete entryTable[entryName];
	                mainHeader.totalEntries = entryList.length;
	            }
	        },

	        /**
	         *  Iterates and returns all nested files and directories of the given entry
	         *
	         * @param entry
	         * @return Array
	         */
	        getEntryChildren: function (/*ZipEntry*/ entry, subfolders = true) {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            if (typeof entry === "object") {
	                if (entry.isDirectory && subfolders) {
	                    const list = [];
	                    const name = entry.entryName;

	                    for (const zipEntry of entryList) {
	                        if (zipEntry.entryName.startsWith(name)) {
	                            list.push(zipEntry);
	                        }
	                    }
	                    return list;
	                } else {
	                    return [entry];
	                }
	            }
	            return [];
	        },

	        /**
	         *  How many child elements entry has
	         *
	         * @param {ZipEntry} entry
	         * @return {integer}
	         */
	        getChildCount: function (entry) {
	            if (entry && entry.isDirectory) {
	                const list = this.getEntryChildren(entry);
	                return list.includes(entry) ? list.length - 1 : list.length;
	            }
	            return 0;
	        },

	        /**
	         * Returns the zip file
	         *
	         * @return Buffer
	         */
	        compressToBuffer: function () {
	            if (!loadedEntries) {
	                readEntries();
	            }
	            sortEntries();

	            const dataBlock = [];
	            const headerBlocks = [];
	            let totalSize = 0;
	            let dindex = 0;

	            mainHeader.size = 0;
	            mainHeader.offset = 0;
	            let totalEntries = 0;

	            for (const entry of this.entries) {
	                // compress data and set local and entry header accordingly. Reason why is called first
	                const compressedData = entry.getCompressedData();
	                entry.header.offset = dindex;

	                // 1. construct local header
	                const localHeader = entry.packLocalHeader();

	                // 2. offsets
	                const dataLength = localHeader.length + compressedData.length;
	                dindex += dataLength;

	                // 3. store values in sequence
	                dataBlock.push(localHeader);
	                dataBlock.push(compressedData);

	                // 4. construct central header
	                const centralHeader = entry.packCentralHeader();
	                headerBlocks.push(centralHeader);
	                // 5. update main header
	                mainHeader.size += centralHeader.length;
	                totalSize += dataLength + centralHeader.length;
	                totalEntries++;
	            }

	            totalSize += mainHeader.mainHeaderSize; // also includes zip file comment length
	            // point to end of data and beginning of central directory first record
	            mainHeader.offset = dindex;
	            mainHeader.totalEntries = totalEntries;

	            dindex = 0;
	            const outBuffer = Buffer.alloc(totalSize);
	            // write data blocks
	            for (const content of dataBlock) {
	                content.copy(outBuffer, dindex);
	                dindex += content.length;
	            }

	            // write central directory entries
	            for (const content of headerBlocks) {
	                content.copy(outBuffer, dindex);
	                dindex += content.length;
	            }

	            // write main header
	            const mh = mainHeader.toBinary();
	            if (_comment) {
	                _comment.copy(mh, Utils.Constants.ENDHDR); // add zip file comment
	            }
	            mh.copy(outBuffer, dindex);

	            // Since we update entry and main header offsets,
	            // they are no longer valid and we have to reset content
	            // (Issue 64)

	            inBuffer = outBuffer;
	            loadedEntries = false;

	            return outBuffer;
	        },

	        toAsyncBuffer: function (/*Function*/ onSuccess, /*Function*/ onFail, /*Function*/ onItemStart, /*Function*/ onItemEnd) {
	            try {
	                if (!loadedEntries) {
	                    readEntries();
	                }
	                sortEntries();

	                const dataBlock = [];
	                const centralHeaders = [];
	                let totalSize = 0;
	                let dindex = 0;
	                let totalEntries = 0;

	                mainHeader.size = 0;
	                mainHeader.offset = 0;

	                const compress2Buffer = function (entryLists) {
	                    if (entryLists.length > 0) {
	                        const entry = entryLists.shift();
	                        const name = entry.entryName + entry.extra.toString();
	                        if (onItemStart) onItemStart(name);
	                        entry.getCompressedDataAsync(function (compressedData) {
	                            if (onItemEnd) onItemEnd(name);
	                            entry.header.offset = dindex;

	                            // 1. construct local header
	                            const localHeader = entry.packLocalHeader();

	                            // 2. offsets
	                            const dataLength = localHeader.length + compressedData.length;
	                            dindex += dataLength;

	                            // 3. store values in sequence
	                            dataBlock.push(localHeader);
	                            dataBlock.push(compressedData);

	                            // central header
	                            const centalHeader = entry.packCentralHeader();
	                            centralHeaders.push(centalHeader);
	                            mainHeader.size += centalHeader.length;
	                            totalSize += dataLength + centalHeader.length;
	                            totalEntries++;

	                            compress2Buffer(entryLists);
	                        });
	                    } else {
	                        totalSize += mainHeader.mainHeaderSize; // also includes zip file comment length
	                        // point to end of data and beginning of central directory first record
	                        mainHeader.offset = dindex;
	                        mainHeader.totalEntries = totalEntries;

	                        dindex = 0;
	                        const outBuffer = Buffer.alloc(totalSize);
	                        dataBlock.forEach(function (content) {
	                            content.copy(outBuffer, dindex); // write data blocks
	                            dindex += content.length;
	                        });
	                        centralHeaders.forEach(function (content) {
	                            content.copy(outBuffer, dindex); // write central directory entries
	                            dindex += content.length;
	                        });

	                        const mh = mainHeader.toBinary();
	                        if (_comment) {
	                            _comment.copy(mh, Utils.Constants.ENDHDR); // add zip file comment
	                        }

	                        mh.copy(outBuffer, dindex); // write main header

	                        // Since we update entry and main header offsets, they are no
	                        // longer valid and we have to reset content using our new buffer
	                        // (Issue 64)

	                        inBuffer = outBuffer;
	                        loadedEntries = false;

	                        onSuccess(outBuffer);
	                    }
	                };

	                compress2Buffer(Array.from(this.entries));
	            } catch (e) {
	                onFail(e);
	            }
	        }
	    };
	};
	return zipFile;
}

var admZip;
var hasRequiredAdmZip;

function requireAdmZip () {
	if (hasRequiredAdmZip) return admZip;
	hasRequiredAdmZip = 1;
	const Utils = requireUtil();
	const pth = path__default;
	const ZipEntry = requireZipEntry();
	const ZipFile = requireZipFile();

	const get_Bool = (...val) => Utils.findLast(val, (c) => typeof c === "boolean");
	const get_Str = (...val) => Utils.findLast(val, (c) => typeof c === "string");
	const get_Fun = (...val) => Utils.findLast(val, (c) => typeof c === "function");

	const defaultOptions = {
	    // option "noSort" : if true it disables files sorting
	    noSort: false,
	    // read entries during load (initial loading may be slower)
	    readEntries: false,
	    // default method is none
	    method: Utils.Constants.NONE,
	    // file system
	    fs: null
	};

	admZip = function (/**String*/ input, /** object */ options) {
	    let inBuffer = null;

	    // create object based default options, allowing them to be overwritten
	    const opts = Object.assign(Object.create(null), defaultOptions);

	    // test input variable
	    if (input && "object" === typeof input) {
	        // if value is not buffer we accept it to be object with options
	        if (!(input instanceof Uint8Array)) {
	            Object.assign(opts, input);
	            input = opts.input ? opts.input : undefined;
	            if (opts.input) delete opts.input;
	        }

	        // if input is buffer
	        if (Buffer.isBuffer(input)) {
	            inBuffer = input;
	            opts.method = Utils.Constants.BUFFER;
	            input = undefined;
	        }
	    }

	    // assign options
	    Object.assign(opts, options);

	    // instanciate utils filesystem
	    const filetools = new Utils(opts);

	    if (typeof opts.decoder !== "object" || typeof opts.decoder.encode !== "function" || typeof opts.decoder.decode !== "function") {
	        opts.decoder = Utils.decoder;
	    }

	    // if input is file name we retrieve its content
	    if (input && "string" === typeof input) {
	        // load zip file
	        if (filetools.fs.existsSync(input)) {
	            opts.method = Utils.Constants.FILE;
	            opts.filename = input;
	            inBuffer = filetools.fs.readFileSync(input);
	        } else {
	            throw Utils.Errors.INVALID_FILENAME();
	        }
	    }

	    // create variable
	    const _zip = new ZipFile(inBuffer, opts);

	    const { canonical, sanitize, zipnamefix } = Utils;

	    function getEntry(/**Object*/ entry) {
	        if (entry && _zip) {
	            var item;
	            // If entry was given as a file name
	            if (typeof entry === "string") item = _zip.getEntry(pth.posix.normalize(entry));
	            // if entry was given as a ZipEntry object
	            if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined") item = _zip.getEntry(entry.entryName);

	            if (item) {
	                return item;
	            }
	        }
	        return null;
	    }

	    function fixPath(zipPath) {
	        const { join, normalize, sep } = pth.posix;
	        // convert windows file separators and normalize
	        return join(".", normalize(sep + zipPath.split("\\").join(sep) + sep));
	    }

	    function filenameFilter(filterfn) {
	        if (filterfn instanceof RegExp) {
	            // if filter is RegExp wrap it
	            return (function (rx) {
	                return function (filename) {
	                    return rx.test(filename);
	                };
	            })(filterfn);
	        } else if ("function" !== typeof filterfn) {
	            // if filter is not function we will replace it
	            return () => true;
	        }
	        return filterfn;
	    }

	    // keep last character on folders
	    const relativePath = (local, entry) => {
	        let lastChar = entry.slice(-1);
	        lastChar = lastChar === filetools.sep ? filetools.sep : "";
	        return pth.relative(local, entry) + lastChar;
	    };

	    return {
	        /**
	         * Extracts the given entry from the archive and returns the content as a Buffer object
	         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
	         * @param {Buffer|string} [pass] - password
	         * @return Buffer or Null in case of error
	         */
	        readFile: function (entry, pass) {
	            var item = getEntry(entry);
	            return (item && item.getData(pass)) || null;
	        },

	        /**
	         * Returns how many child elements has on entry (directories) on files it is always 0
	         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
	         * @returns {integer}
	         */
	        childCount: function (entry) {
	            const item = getEntry(entry);
	            if (item) {
	                return _zip.getChildCount(item);
	            }
	        },

	        /**
	         * Asynchronous readFile
	         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
	         * @param {callback} callback
	         *
	         * @return Buffer or Null in case of error
	         */
	        readFileAsync: function (entry, callback) {
	            var item = getEntry(entry);
	            if (item) {
	                item.getDataAsync(callback);
	            } else {
	                callback(null, "getEntry failed for:" + entry);
	            }
	        },

	        /**
	         * Extracts the given entry from the archive and returns the content as plain text in the given encoding
	         * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
	         * @param {string} encoding - Optional. If no encoding is specified utf8 is used
	         *
	         * @return String
	         */
	        readAsText: function (entry, encoding) {
	            var item = getEntry(entry);
	            if (item) {
	                var data = item.getData();
	                if (data && data.length) {
	                    return data.toString(encoding || "utf8");
	                }
	            }
	            return "";
	        },

	        /**
	         * Asynchronous readAsText
	         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
	         * @param {callback} callback
	         * @param {string} [encoding] - Optional. If no encoding is specified utf8 is used
	         *
	         * @return String
	         */
	        readAsTextAsync: function (entry, callback, encoding) {
	            var item = getEntry(entry);
	            if (item) {
	                item.getDataAsync(function (data, err) {
	                    if (err) {
	                        callback(data, err);
	                        return;
	                    }

	                    if (data && data.length) {
	                        callback(data.toString(encoding || "utf8"));
	                    } else {
	                        callback("");
	                    }
	                });
	            } else {
	                callback("");
	            }
	        },

	        /**
	         * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
	         *
	         * @param {ZipEntry|string} entry
	         * @returns {void}
	         */
	        deleteFile: function (entry, withsubfolders = true) {
	            // @TODO: test deleteFile
	            var item = getEntry(entry);
	            if (item) {
	                _zip.deleteFile(item.entryName, withsubfolders);
	            }
	        },

	        /**
	         * Remove the entry from the file or directory without affecting any nested entries
	         *
	         * @param {ZipEntry|string} entry
	         * @returns {void}
	         */
	        deleteEntry: function (entry) {
	            // @TODO: test deleteEntry
	            var item = getEntry(entry);
	            if (item) {
	                _zip.deleteEntry(item.entryName);
	            }
	        },

	        /**
	         * Adds a comment to the zip. The zip must be rewritten after adding the comment.
	         *
	         * @param {string} comment
	         */
	        addZipComment: function (comment) {
	            // @TODO: test addZipComment
	            _zip.comment = comment;
	        },

	        /**
	         * Returns the zip comment
	         *
	         * @return String
	         */
	        getZipComment: function () {
	            return _zip.comment || "";
	        },

	        /**
	         * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
	         * The comment cannot exceed 65535 characters in length
	         *
	         * @param {ZipEntry} entry
	         * @param {string} comment
	         */
	        addZipEntryComment: function (entry, comment) {
	            var item = getEntry(entry);
	            if (item) {
	                item.comment = comment;
	            }
	        },

	        /**
	         * Returns the comment of the specified entry
	         *
	         * @param {ZipEntry} entry
	         * @return String
	         */
	        getZipEntryComment: function (entry) {
	            var item = getEntry(entry);
	            if (item) {
	                return item.comment || "";
	            }
	            return "";
	        },

	        /**
	         * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
	         *
	         * @param {ZipEntry} entry
	         * @param {Buffer} content
	         */
	        updateFile: function (entry, content) {
	            var item = getEntry(entry);
	            if (item) {
	                item.setData(content);
	            }
	        },

	        /**
	         * Adds a file from the disk to the archive
	         *
	         * @param {string} localPath File to add to zip
	         * @param {string} [zipPath] Optional path inside the zip
	         * @param {string} [zipName] Optional name for the file
	         * @param {string} [comment] Optional file comment
	         */
	        addLocalFile: function (localPath, zipPath, zipName, comment) {
	            if (filetools.fs.existsSync(localPath)) {
	                // fix ZipPath
	                zipPath = zipPath ? fixPath(zipPath) : "";

	                // p - local file name
	                const p = pth.win32.basename(pth.win32.normalize(localPath));

	                // add file name into zippath
	                zipPath += zipName ? zipName : p;

	                // read file attributes
	                const _attr = filetools.fs.statSync(localPath);

	                // get file content
	                const data = _attr.isFile() ? filetools.fs.readFileSync(localPath) : Buffer.alloc(0);

	                // if folder
	                if (_attr.isDirectory()) zipPath += filetools.sep;

	                // add file into zip file
	                this.addFile(zipPath, data, comment, _attr);
	            } else {
	                throw Utils.Errors.FILE_NOT_FOUND(localPath);
	            }
	        },

	        /**
	         * Callback for showing if everything was done.
	         *
	         * @callback doneCallback
	         * @param {Error} err - Error object
	         * @param {boolean} done - was request fully completed
	         */

	        /**
	         * Adds a file from the disk to the archive
	         *
	         * @param {(object|string)} options - options object, if it is string it us used as localPath.
	         * @param {string} options.localPath - Local path to the file.
	         * @param {string} [options.comment] - Optional file comment.
	         * @param {string} [options.zipPath] - Optional path inside the zip
	         * @param {string} [options.zipName] - Optional name for the file
	         * @param {doneCallback} callback - The callback that handles the response.
	         */
	        addLocalFileAsync: function (options, callback) {
	            options = typeof options === "object" ? options : { localPath: options };
	            const localPath = pth.resolve(options.localPath);
	            const { comment } = options;
	            let { zipPath, zipName } = options;
	            const self = this;

	            filetools.fs.stat(localPath, function (err, stats) {
	                if (err) return callback(err, false);
	                // fix ZipPath
	                zipPath = zipPath ? fixPath(zipPath) : "";
	                // p - local file name
	                const p = pth.win32.basename(pth.win32.normalize(localPath));
	                // add file name into zippath
	                zipPath += zipName ? zipName : p;

	                if (stats.isFile()) {
	                    filetools.fs.readFile(localPath, function (err, data) {
	                        if (err) return callback(err, false);
	                        self.addFile(zipPath, data, comment, stats);
	                        return setImmediate(callback, undefined, true);
	                    });
	                } else if (stats.isDirectory()) {
	                    zipPath += filetools.sep;
	                    self.addFile(zipPath, Buffer.alloc(0), comment, stats);
	                    return setImmediate(callback, undefined, true);
	                }
	            });
	        },

	        /**
	         * Adds a local directory and all its nested files and directories to the archive
	         *
	         * @param {string} localPath - local path to the folder
	         * @param {string} [zipPath] - optional path inside zip
	         * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
	         */
	        addLocalFolder: function (localPath, zipPath, filter) {
	            // Prepare filter
	            filter = filenameFilter(filter);

	            // fix ZipPath
	            zipPath = zipPath ? fixPath(zipPath) : "";

	            // normalize the path first
	            localPath = pth.normalize(localPath);

	            if (filetools.fs.existsSync(localPath)) {
	                const items = filetools.findFiles(localPath);
	                const self = this;

	                if (items.length) {
	                    for (const filepath of items) {
	                        const p = pth.join(zipPath, relativePath(localPath, filepath));
	                        if (filter(p)) {
	                            self.addLocalFile(filepath, pth.dirname(p));
	                        }
	                    }
	                }
	            } else {
	                throw Utils.Errors.FILE_NOT_FOUND(localPath);
	            }
	        },

	        /**
	         * Asynchronous addLocalFolder
	         * @param {string} localPath
	         * @param {callback} callback
	         * @param {string} [zipPath] optional path inside zip
	         * @param {RegExp|function} [filter] optional RegExp or Function if files match will
	         *               be included.
	         */
	        addLocalFolderAsync: function (localPath, callback, zipPath, filter) {
	            // Prepare filter
	            filter = filenameFilter(filter);

	            // fix ZipPath
	            zipPath = zipPath ? fixPath(zipPath) : "";

	            // normalize the path first
	            localPath = pth.normalize(localPath);

	            var self = this;
	            filetools.fs.open(localPath, "r", function (err) {
	                if (err && err.code === "ENOENT") {
	                    callback(undefined, Utils.Errors.FILE_NOT_FOUND(localPath));
	                } else if (err) {
	                    callback(undefined, err);
	                } else {
	                    var items = filetools.findFiles(localPath);
	                    var i = -1;

	                    var next = function () {
	                        i += 1;
	                        if (i < items.length) {
	                            var filepath = items[i];
	                            var p = relativePath(localPath, filepath).split("\\").join("/"); //windows fix
	                            p = p
	                                .normalize("NFD")
	                                .replace(/[\u0300-\u036f]/g, "")
	                                .replace(/[^\x20-\x7E]/g, ""); // accent fix
	                            if (filter(p)) {
	                                filetools.fs.stat(filepath, function (er0, stats) {
	                                    if (er0) callback(undefined, er0);
	                                    if (stats.isFile()) {
	                                        filetools.fs.readFile(filepath, function (er1, data) {
	                                            if (er1) {
	                                                callback(undefined, er1);
	                                            } else {
	                                                self.addFile(zipPath + p, data, "", stats);
	                                                next();
	                                            }
	                                        });
	                                    } else {
	                                        self.addFile(zipPath + p + "/", Buffer.alloc(0), "", stats);
	                                        next();
	                                    }
	                                });
	                            } else {
	                                process.nextTick(() => {
	                                    next();
	                                });
	                            }
	                        } else {
	                            callback(true, undefined);
	                        }
	                    };

	                    next();
	                }
	            });
	        },

	        /**
	         * Adds a local directory and all its nested files and directories to the archive
	         *
	         * @param {object | string} options - options object, if it is string it us used as localPath.
	         * @param {string} options.localPath - Local path to the folder.
	         * @param {string} [options.zipPath] - optional path inside zip.
	         * @param {RegExp|function} [options.filter] - optional RegExp or Function if files match will be included.
	         * @param {function|string} [options.namefix] - optional function to help fix filename
	         * @param {doneCallback} callback - The callback that handles the response.
	         *
	         */
	        addLocalFolderAsync2: function (options, callback) {
	            const self = this;
	            options = typeof options === "object" ? options : { localPath: options };
	            localPath = pth.resolve(fixPath(options.localPath));
	            let { zipPath, filter, namefix } = options;

	            if (filter instanceof RegExp) {
	                filter = (function (rx) {
	                    return function (filename) {
	                        return rx.test(filename);
	                    };
	                })(filter);
	            } else if ("function" !== typeof filter) {
	                filter = function () {
	                    return true;
	                };
	            }

	            // fix ZipPath
	            zipPath = zipPath ? fixPath(zipPath) : "";

	            // Check Namefix function
	            if (namefix == "latin1") {
	                namefix = (str) =>
	                    str
	                        .normalize("NFD")
	                        .replace(/[\u0300-\u036f]/g, "")
	                        .replace(/[^\x20-\x7E]/g, ""); // accent fix (latin1 characers only)
	            }

	            if (typeof namefix !== "function") namefix = (str) => str;

	            // internal, create relative path + fix the name
	            const relPathFix = (entry) => pth.join(zipPath, namefix(relativePath(localPath, entry)));
	            const fileNameFix = (entry) => pth.win32.basename(pth.win32.normalize(namefix(entry)));

	            filetools.fs.open(localPath, "r", function (err) {
	                if (err && err.code === "ENOENT") {
	                    callback(undefined, Utils.Errors.FILE_NOT_FOUND(localPath));
	                } else if (err) {
	                    callback(undefined, err);
	                } else {
	                    filetools.findFilesAsync(localPath, function (err, fileEntries) {
	                        if (err) return callback(err);
	                        fileEntries = fileEntries.filter((dir) => filter(relPathFix(dir)));
	                        if (!fileEntries.length) callback(undefined, false);

	                        setImmediate(
	                            fileEntries.reverse().reduce(function (next, entry) {
	                                return function (err, done) {
	                                    if (err || done === false) return setImmediate(next, err, false);

	                                    self.addLocalFileAsync(
	                                        {
	                                            localPath: entry,
	                                            zipPath: pth.dirname(relPathFix(entry)),
	                                            zipName: fileNameFix(entry)
	                                        },
	                                        next
	                                    );
	                                };
	                            }, callback)
	                        );
	                    });
	                }
	            });
	        },

	        /**
	         * Adds a local directory and all its nested files and directories to the archive
	         *
	         * @param {string} localPath - path where files will be extracted
	         * @param {object} props - optional properties
	         * @param {string} [props.zipPath] - optional path inside zip
	         * @param {RegExp|function} [props.filter] - optional RegExp or Function if files match will be included.
	         * @param {function|string} [props.namefix] - optional function to help fix filename
	         */
	        addLocalFolderPromise: function (localPath, props) {
	            return new Promise((resolve, reject) => {
	                this.addLocalFolderAsync2(Object.assign({ localPath }, props), (err, done) => {
	                    if (err) reject(err);
	                    if (done) resolve(this);
	                });
	            });
	        },

	        /**
	         * Allows you to create a entry (file or directory) in the zip file.
	         * If you want to create a directory the entryName must end in / and a null buffer should be provided.
	         * Comment and attributes are optional
	         *
	         * @param {string} entryName
	         * @param {Buffer | string} content - file content as buffer or utf8 coded string
	         * @param {string} [comment] - file comment
	         * @param {number | object} [attr] - number as unix file permissions, object as filesystem Stats object
	         */
	        addFile: function (entryName, content, comment, attr) {
	            entryName = zipnamefix(entryName);
	            let entry = getEntry(entryName);
	            const update = entry != null;

	            // prepare new entry
	            if (!update) {
	                entry = new ZipEntry(opts);
	                entry.entryName = entryName;
	            }
	            entry.comment = comment || "";

	            const isStat = "object" === typeof attr && attr instanceof filetools.fs.Stats;

	            // last modification time from file stats
	            if (isStat) {
	                entry.header.time = attr.mtime;
	            }

	            // Set file attribute
	            var fileattr = entry.isDirectory ? 0x10 : 0; // (MS-DOS directory flag)

	            // extended attributes field for Unix
	            // set file type either S_IFDIR / S_IFREG
	            let unix = entry.isDirectory ? 0x4000 : 0x8000;

	            if (isStat) {
	                // File attributes from file stats
	                unix |= 0xfff & attr.mode;
	            } else if ("number" === typeof attr) {
	                // attr from given attr values
	                unix |= 0xfff & attr;
	            } else {
	                // Default values:
	                unix |= entry.isDirectory ? 0o755 : 0o644; // permissions (drwxr-xr-x) or (-r-wr--r--)
	            }

	            fileattr = (fileattr | (unix << 16)) >>> 0; // add attributes

	            entry.attr = fileattr;

	            entry.setData(content);
	            if (!update) _zip.setEntry(entry);

	            return entry;
	        },

	        /**
	         * Returns an array of ZipEntry objects representing the files and folders inside the archive
	         *
	         * @param {string} [password]
	         * @returns Array
	         */
	        getEntries: function (password) {
	            _zip.password = password;
	            return _zip ? _zip.entries : [];
	        },

	        /**
	         * Returns a ZipEntry object representing the file or folder specified by ``name``.
	         *
	         * @param {string} name
	         * @return ZipEntry
	         */
	        getEntry: function (/**String*/ name) {
	            return getEntry(name);
	        },

	        getEntryCount: function () {
	            return _zip.getEntryCount();
	        },

	        forEach: function (callback) {
	            return _zip.forEach(callback);
	        },

	        /**
	         * Extracts the given entry to the given targetPath
	         * If the entry is a directory inside the archive, the entire directory and it's subdirectories will be extracted
	         *
	         * @param {string|ZipEntry} entry - ZipEntry object or String with the full path of the entry
	         * @param {string} targetPath - Target folder where to write the file
	         * @param {boolean} [maintainEntryPath=true] - If maintainEntryPath is true and the entry is inside a folder, the entry folder will be created in targetPath as well. Default is TRUE
	         * @param {boolean} [overwrite=false] - If the file already exists at the target path, the file will be overwriten if this is true.
	         * @param {boolean} [keepOriginalPermission=false] - The file will be set as the permission from the entry if this is true.
	         * @param {string} [outFileName] - String If set will override the filename of the extracted file (Only works if the entry is a file)
	         *
	         * @return Boolean
	         */
	        extractEntryTo: function (entry, targetPath, maintainEntryPath, overwrite, keepOriginalPermission, outFileName) {
	            overwrite = get_Bool(false, overwrite);
	            keepOriginalPermission = get_Bool(false, keepOriginalPermission);
	            maintainEntryPath = get_Bool(true, maintainEntryPath);
	            outFileName = get_Str(keepOriginalPermission, outFileName);

	            var item = getEntry(entry);
	            if (!item) {
	                throw Utils.Errors.NO_ENTRY();
	            }

	            var entryName = canonical(item.entryName);

	            var target = sanitize(targetPath, outFileName && !item.isDirectory ? outFileName : maintainEntryPath ? entryName : pth.basename(entryName));

	            if (item.isDirectory) {
	                var children = _zip.getEntryChildren(item);
	                children.forEach(function (child) {
	                    if (child.isDirectory) return;
	                    var content = child.getData();
	                    if (!content) {
	                        throw Utils.Errors.CANT_EXTRACT_FILE();
	                    }
	                    var name = canonical(child.entryName);
	                    var childName = sanitize(targetPath, maintainEntryPath ? name : pth.basename(name));
	                    // The reverse operation for attr depend on method addFile()
	                    const fileAttr = keepOriginalPermission ? child.header.fileAttr : undefined;
	                    filetools.writeFileTo(childName, content, overwrite, fileAttr);
	                });
	                return true;
	            }

	            var content = item.getData(_zip.password);
	            if (!content) throw Utils.Errors.CANT_EXTRACT_FILE();

	            if (filetools.fs.existsSync(target) && !overwrite) {
	                throw Utils.Errors.CANT_OVERRIDE();
	            }
	            // The reverse operation for attr depend on method addFile()
	            const fileAttr = keepOriginalPermission ? entry.header.fileAttr : undefined;
	            filetools.writeFileTo(target, content, overwrite, fileAttr);

	            return true;
	        },

	        /**
	         * Test the archive
	         * @param {string} [pass]
	         */
	        test: function (pass) {
	            if (!_zip) {
	                return false;
	            }

	            for (var entry in _zip.entries) {
	                try {
	                    if (entry.isDirectory) {
	                        continue;
	                    }
	                    var content = _zip.entries[entry].getData(pass);
	                    if (!content) {
	                        return false;
	                    }
	                } catch (err) {
	                    return false;
	                }
	            }
	            return true;
	        },

	        /**
	         * Extracts the entire archive to the given location
	         *
	         * @param {string} targetPath Target location
	         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
	         *                  Default is FALSE
	         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
	         *                  Default is FALSE
	         * @param {string|Buffer} [pass] password
	         */
	        extractAllTo: function (targetPath, overwrite, keepOriginalPermission, pass) {
	            keepOriginalPermission = get_Bool(false, keepOriginalPermission);
	            pass = get_Str(keepOriginalPermission, pass);
	            overwrite = get_Bool(false, overwrite);
	            if (!_zip) throw Utils.Errors.NO_ZIP();

	            _zip.entries.forEach(function (entry) {
	                var entryName = sanitize(targetPath, canonical(entry.entryName));
	                if (entry.isDirectory) {
	                    filetools.makeDir(entryName);
	                    return;
	                }
	                var content = entry.getData(pass);
	                if (!content) {
	                    throw Utils.Errors.CANT_EXTRACT_FILE();
	                }
	                // The reverse operation for attr depend on method addFile()
	                const fileAttr = keepOriginalPermission ? entry.header.fileAttr : undefined;
	                filetools.writeFileTo(entryName, content, overwrite, fileAttr);
	                try {
	                    filetools.fs.utimesSync(entryName, entry.header.time, entry.header.time);
	                } catch (err) {
	                    throw Utils.Errors.CANT_EXTRACT_FILE();
	                }
	            });
	        },

	        /**
	         * Asynchronous extractAllTo
	         *
	         * @param {string} targetPath Target location
	         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
	         *                  Default is FALSE
	         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
	         *                  Default is FALSE
	         * @param {function} callback The callback will be executed when all entries are extracted successfully or any error is thrown.
	         */
	        extractAllToAsync: function (targetPath, overwrite, keepOriginalPermission, callback) {
	            callback = get_Fun(overwrite, keepOriginalPermission, callback);
	            keepOriginalPermission = get_Bool(false, keepOriginalPermission);
	            overwrite = get_Bool(false, overwrite);
	            if (!callback) {
	                return new Promise((resolve, reject) => {
	                    this.extractAllToAsync(targetPath, overwrite, keepOriginalPermission, function (err) {
	                        if (err) {
	                            reject(err);
	                        } else {
	                            resolve(this);
	                        }
	                    });
	                });
	            }
	            if (!_zip) {
	                callback(Utils.Errors.NO_ZIP());
	                return;
	            }

	            targetPath = pth.resolve(targetPath);
	            // convert entryName to
	            const getPath = (entry) => sanitize(targetPath, pth.normalize(canonical(entry.entryName)));
	            const getError = (msg, file) => new Error(msg + ': "' + file + '"');

	            // separate directories from files
	            const dirEntries = [];
	            const fileEntries = [];
	            _zip.entries.forEach((e) => {
	                if (e.isDirectory) {
	                    dirEntries.push(e);
	                } else {
	                    fileEntries.push(e);
	                }
	            });

	            // Create directory entries first synchronously
	            // this prevents race condition and assures folders are there before writing files
	            for (const entry of dirEntries) {
	                const dirPath = getPath(entry);
	                // The reverse operation for attr depend on method addFile()
	                const dirAttr = keepOriginalPermission ? entry.header.fileAttr : undefined;
	                try {
	                    filetools.makeDir(dirPath);
	                    if (dirAttr) filetools.fs.chmodSync(dirPath, dirAttr);
	                    // in unix timestamp will change if files are later added to folder, but still
	                    filetools.fs.utimesSync(dirPath, entry.header.time, entry.header.time);
	                } catch (er) {
	                    callback(getError("Unable to create folder", dirPath));
	                }
	            }

	            fileEntries.reverse().reduce(function (next, entry) {
	                return function (err) {
	                    if (err) {
	                        next(err);
	                    } else {
	                        const entryName = pth.normalize(canonical(entry.entryName));
	                        const filePath = sanitize(targetPath, entryName);
	                        entry.getDataAsync(function (content, err_1) {
	                            if (err_1) {
	                                next(err_1);
	                            } else if (!content) {
	                                next(Utils.Errors.CANT_EXTRACT_FILE());
	                            } else {
	                                // The reverse operation for attr depend on method addFile()
	                                const fileAttr = keepOriginalPermission ? entry.header.fileAttr : undefined;
	                                filetools.writeFileToAsync(filePath, content, overwrite, fileAttr, function (succ) {
	                                    if (!succ) {
	                                        next(getError("Unable to write file", filePath));
	                                    }
	                                    filetools.fs.utimes(filePath, entry.header.time, entry.header.time, function (err_2) {
	                                        if (err_2) {
	                                            next(getError("Unable to set times", filePath));
	                                        } else {
	                                            next();
	                                        }
	                                    });
	                                });
	                            }
	                        });
	                    }
	                };
	            }, callback)();
	        },

	        /**
	         * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
	         *
	         * @param {string} targetFileName
	         * @param {function} callback
	         */
	        writeZip: function (targetFileName, callback) {
	            if (arguments.length === 1) {
	                if (typeof targetFileName === "function") {
	                    callback = targetFileName;
	                    targetFileName = "";
	                }
	            }

	            if (!targetFileName && opts.filename) {
	                targetFileName = opts.filename;
	            }
	            if (!targetFileName) return;

	            var zipData = _zip.compressToBuffer();
	            if (zipData) {
	                var ok = filetools.writeFileTo(targetFileName, zipData, true);
	                if (typeof callback === "function") callback(!ok ? new Error("failed") : null, "");
	            }
	        },

	        /**
	         *
	         * @param {string} targetFileName
	         * @param {object} [props]
	         * @param {boolean} [props.overwrite=true] If the file already exists at the target path, the file will be overwriten if this is true.
	         * @param {boolean} [props.perm] The file will be set as the permission from the entry if this is true.

	         * @returns {Promise<void>}
	         */
	        writeZipPromise: function (/**String*/ targetFileName, /* object */ props) {
	            const { overwrite, perm } = Object.assign({ overwrite: true }, props);

	            return new Promise((resolve, reject) => {
	                // find file name
	                if (!targetFileName && opts.filename) targetFileName = opts.filename;
	                if (!targetFileName) reject("ADM-ZIP: ZIP File Name Missing");

	                this.toBufferPromise().then((zipData) => {
	                    const ret = (done) => (done ? resolve(done) : reject("ADM-ZIP: Wasn't able to write zip file"));
	                    filetools.writeFileToAsync(targetFileName, zipData, overwrite, perm, ret);
	                }, reject);
	            });
	        },

	        /**
	         * @returns {Promise<Buffer>} A promise to the Buffer.
	         */
	        toBufferPromise: function () {
	            return new Promise((resolve, reject) => {
	                _zip.toAsyncBuffer(resolve, reject);
	            });
	        },

	        /**
	         * Returns the content of the entire zip file as a Buffer object
	         *
	         * @prop {function} [onSuccess]
	         * @prop {function} [onFail]
	         * @prop {function} [onItemStart]
	         * @prop {function} [onItemEnd]
	         * @returns {Buffer}
	         */
	        toBuffer: function (onSuccess, onFail, onItemStart, onItemEnd) {
	            if (typeof onSuccess === "function") {
	                _zip.toAsyncBuffer(onSuccess, onFail, onItemStart, onItemEnd);
	                return null;
	            }
	            return _zip.compressToBuffer();
	        }
	    };
	};
	return admZip;
}

var admZipExports = requireAdmZip();
const AdmZip = /*@__PURE__*/getDefaultExportFromCjs(admZipExports);

function registerApiRoutes(ctx) {
  const router = ctx.router;
  router.getNoAuth("/status", (_req, res) => {
    res.json({
      code: 0,
      data: {
        pluginName: ctx.pluginName,
        uptime: pluginState.getUptime(),
        uptimeFormatted: pluginState.getUptimeFormatted(),
        config: pluginState.config,
        stats: pluginState.stats
      }
    });
  });
  router.getNoAuth("/config", (_req, res) => {
    res.json({ code: 0, data: pluginState.config });
  });
  router.postNoAuth("/config", async (req, res) => {
    try {
      const body = req.body;
      if (!body) {
        return res.status(400).json({ code: -1, message: "请求体为空" });
      }
      pluginState.updateConfig(body);
      ctx.logger.info("配置已保存");
      res.json({ code: 0, message: "ok" });
    } catch (err) {
      ctx.logger.error("保存配置失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.getNoAuth("/groups", async (_req, res) => {
    try {
      const groups = await ctx.actions.call(
        "get_group_list",
        {},
        ctx.adapterName,
        ctx.pluginManager.config
      );
      const groupsWithConfig = (groups || []).map((group) => {
        const groupId = String(group.group_id);
        return {
          group_id: group.group_id,
          group_name: group.group_name,
          member_count: group.member_count,
          max_member_count: group.max_member_count,
          enabled: pluginState.isGroupEnabled(groupId)
        };
      });
      res.json({ code: 0, data: groupsWithConfig });
    } catch (e) {
      ctx.logger.error("获取群列表失败:", e);
      res.status(500).json({ code: -1, message: String(e) });
    }
  });
  router.postNoAuth("/groups/:id/config", async (req, res) => {
    try {
      const groupId = req.params?.id;
      if (!groupId) {
        return res.status(400).json({ code: -1, message: "缺少群 ID" });
      }
      const body = req.body;
      const enabled = body?.enabled;
      pluginState.updateGroupConfig(groupId, { enabled: Boolean(enabled) });
      ctx.logger.info(`群 ${groupId} 配置已更新: enabled=${enabled}`);
      res.json({ code: 0, message: "ok" });
    } catch (err) {
      ctx.logger.error("更新群配置失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.postNoAuth("/groups/bulk-config", async (req, res) => {
    try {
      const body = req.body;
      const { enabled, groupIds } = body || {};
      if (typeof enabled !== "boolean" || !Array.isArray(groupIds)) {
        return res.status(400).json({ code: -1, message: "参数错误" });
      }
      for (const groupId of groupIds) {
        pluginState.updateGroupConfig(String(groupId), { enabled });
      }
      ctx.logger.info(`批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`);
      res.json({ code: 0, message: "ok" });
    } catch (err) {
      ctx.logger.error("批量更新群配置失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.getNoAuth("/admin-users", (_req, res) => {
    try {
      res.json({ code: 0, data: pluginState.config.adminUsers || [] });
    } catch (err) {
      ctx.logger.error("获取管理员用户列表失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.postNoAuth("/admin-users", async (req, res) => {
    try {
      const body = req.body;
      const { userId } = body || {};
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ code: -1, message: "用户ID不能为空且必须为字符串" });
      }
      const adminUsers = [...pluginState.config.adminUsers || []];
      if (!adminUsers.includes(userId)) {
        adminUsers.push(userId);
        pluginState.updateConfig({ adminUsers });
      }
      ctx.logger.info(`用户 ${userId} 已被添加为管理员`);
      res.json({ code: 0, message: "添加管理员成功", data: adminUsers });
    } catch (err) {
      ctx.logger.error("添加管理员用户失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.deleteNoAuth("/admin-users/:userId", async (req, res) => {
    try {
      const userId = req.params?.userId;
      if (!userId) {
        return res.status(400).json({ code: -1, message: "用户ID不能为空" });
      }
      const adminUsers = [...pluginState.config.adminUsers || []];
      const index = adminUsers.indexOf(userId);
      if (index !== -1) {
        adminUsers.splice(index, 1);
        pluginState.updateConfig({ adminUsers });
      }
      ctx.logger.info(`用户 ${userId} 已被移除管理员权限`);
      res.json({ code: 0, message: "移除管理员成功", data: adminUsers });
    } catch (err) {
      ctx.logger.error("移除管理员用户失败:", err);
      res.status(500).json({ code: -1, message: String(err) });
    }
  });
  router.getNoAuth("/steam-binds", (req, res) => {
    try {
      const { fromId, type } = req.query;
      let binds = loadSteamBindData();
      if (fromId && type) {
        binds = binds.filter(
          (item) => item.from?.some((f) => f.id === fromId && f.type === type)
        );
      }
      res.json({ code: 0, data: binds });
    } catch (error) {
      pluginState.logger.error("获取 Steam 绑定列表失败:", error);
      res.json({ code: -1, message: "获取失败" });
    }
  });
  router.postNoAuth("/steam-bind", async (req, res) => {
    try {
      const body = req.body;
      const { steamId, fromId, type, nickname } = body || {};
      if (!steamId || !fromId || !type) {
        return res.status(400).json({ code: -1, message: "参数不完整" });
      }
      if (typeof steamId !== "string" || typeof fromId !== "string" || type !== "group" && type !== "private") {
        return res.status(400).json({ code: -1, message: "参数类型错误" });
      }
      const playerSummary = await steamService.getPlayerSummary(String(steamId));
      if (!playerSummary) {
        return res.json({ code: -1, message: "无法找到 Steam 用户" });
      }
      let bindItem = findSteamBindItem(String(steamId));
      if (!bindItem) {
        bindItem = {
          steamId: String(steamId),
          personName: playerSummary.personaname,
          face: playerSummary.avatarmedium,
          from: []
        };
      }
      const newFromInfo = {
        id: String(fromId),
        type,
        nickname: nickname ? String(nickname) : void 0
      };
      const existingIndex = bindItem.from?.findIndex(
        (f) => f.id === fromId && f.type === type
      );
      if (existingIndex !== void 0 && existingIndex !== -1) {
        bindItem.from[existingIndex] = newFromInfo;
      } else {
        bindItem.from.push(newFromInfo);
      }
      updateSteamBindItem(bindItem);
      ctx.logger.info(`Steam 绑定已添加/更新: ${steamId}`);
      res.json({ code: 0, message: "绑定成功" });
    } catch (error) {
      pluginState.logger.error("添加 Steam 绑定失败:", error);
      res.status(500).json({ code: -1, message: "绑定失败" });
    }
  });
  router.deleteNoAuth("/steam-bind/:steamId/from/:fromId", (req, res) => {
    try {
      const steamId = req.params?.steamId;
      const fromId = req.params?.fromId;
      const { type } = req.query;
      if (!steamId || !fromId || !type) {
        return res.status(400).json({ code: -1, message: "参数不完整" });
      }
      if (type !== "group" && type !== "private") {
        return res.status(400).json({ code: -1, message: "type 参数错误" });
      }
      const bindItem = findSteamBindItem(steamId);
      if (!bindItem) {
        return res.json({ code: -1, message: "绑定不存在" });
      }
      bindItem.from = bindItem.from?.filter(
        (f) => !(f.id === fromId && f.type === type)
      );
      if (!bindItem.from || bindItem.from.length === 0) {
        const allBinds = loadSteamBindData();
        const index = allBinds.findIndex((b) => b.steamId === steamId);
        if (index !== -1) {
          allBinds.splice(index, 1);
          saveSteamBindData(allBinds);
        }
      } else {
        updateSteamBindItem(bindItem);
      }
      ctx.logger.info(`Steam 绑定已删除: ${steamId} from ${type}:${fromId}`);
      res.json({ code: 0, message: "删除成功" });
    } catch (error) {
      pluginState.logger.error("删除 Steam 绑定失败:", error);
      res.status(500).json({ code: -1, message: "删除失败" });
    }
  });
  router.getNoAuth("/game-names", (_req, res) => {
    try {
      const games = gameNameService.getAllGames();
      res.json({ code: 0, data: games });
    } catch (error) {
      pluginState.logger.error("获取游戏名称列表失败:", error);
      res.status(500).json({ code: -1, message: "获取失败" });
    }
  });
  router.putNoAuth("/game-name/:appid", async (req, res) => {
    try {
      const appid = req.params?.appid;
      const body = req.body;
      const { zh } = body || {};
      if (!appid) {
        return res.status(400).json({ code: -1, message: "缺少游戏 ID" });
      }
      if (typeof zh !== "string") {
        return res.status(400).json({ code: -1, message: "中文名称必须是字符串" });
      }
      const success = gameNameService.updateChineseName(appid, zh);
      if (!success) {
        return res.status(404).json({ code: -1, message: "游戏不存在" });
      }
      ctx.logger.info(`游戏中文名已更新: ${appid} -> ${zh}`);
      res.json({ code: 0, message: "更新成功" });
    } catch (error) {
      pluginState.logger.error("更新游戏中文名失败:", error);
      res.status(500).json({ code: -1, message: "更新失败" });
    }
  });
  router.deleteNoAuth("/game-name/:appid", async (req, res) => {
    try {
      const appid = req.params?.appid;
      if (!appid) {
        return res.status(400).json({ code: -1, message: "缺少游戏 ID" });
      }
      const success = gameNameService.deleteGame(appid);
      if (!success) {
        return res.status(404).json({ code: -1, message: "游戏不存在" });
      }
      ctx.logger.info(`游戏已删除: ${appid}`);
      res.json({ code: 0, message: "删除成功" });
    } catch (error) {
      pluginState.logger.error("删除游戏失败:", error);
      res.status(500).json({ code: -1, message: "删除失败" });
    }
  });
  router.getNoAuth("/data-export", (_req, res) => {
    try {
      const dataPath = pluginState.ctx.dataPath;
      if (!fs__default.existsSync(dataPath)) {
        return res.status(500).json({ code: -1, message: "数据目录不存在" });
      }
      const files = fs__default.readdirSync(dataPath);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));
      if (jsonFiles.length === 0) {
        return res.status(500).json({ code: -1, message: "没有可导出的数据文件" });
      }
      const zip = new AdmZip();
      for (const file of jsonFiles) {
        const filePath = path__default.join(dataPath, file);
        const content = fs__default.readFileSync(filePath);
        zip.addFile(file, content);
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const zipFileName = `steam-plugin-data-export-${timestamp}.zip`;
      const zipBuffer = zip.toBuffer();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);
      res.send(zipBuffer);
      ctx.logger.info(`数据导出完成: ${zipFileName}, 包含 ${jsonFiles.length} 个文件`);
    } catch (error) {
      ctx.logger.error("数据导出失败:", error);
      res.status(500).json({ code: -1, message: `导出失败: ${error}` });
    }
  });
  router.postNoAuth("/data-import", async (req, res) => {
    try {
      if (!req.body || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ code: -1, message: "请上传文件" });
      }
      const dataPath = pluginState.ctx.dataPath;
      if (!fs__default.existsSync(dataPath)) {
        fs__default.mkdirSync(dataPath, { recursive: true });
      }
      let zip;
      try {
        zip = new AdmZip(req.body);
      } catch (error) {
        return res.status(400).json({ code: -1, message: "无效的压缩包文件" });
      }
      const zipEntries = zip.getEntries();
      const jsonEntries = zipEntries.filter(
        (entry) => entry.entryName.endsWith(".json") && !entry.isDirectory
      );
      if (jsonEntries.length === 0) {
        return res.status(400).json({ code: -1, message: "压缩包内没有找到数据文件" });
      }
      const importedFiles = [];
      for (const entry of jsonEntries) {
        const content = entry.getData().toString("utf-8");
        try {
          JSON.parse(content);
        } catch (error) {
          return res.status(400).json({
            code: -1,
            message: `数据文件格式无效: ${entry.entryName}`
          });
        }
        importedFiles.push(entry.entryName);
      }
      const backupDir = path__default.join(dataPath, "../backup");
      if (!fs__default.existsSync(backupDir)) {
        fs__default.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const existingFiles = fs__default.readdirSync(dataPath).filter((f) => f.endsWith(".json"));
      for (const file of existingFiles) {
        const sourcePath = path__default.join(dataPath, file);
        const backupPath = path__default.join(backupDir, `${file}.pre-import-${timestamp}`);
        fs__default.copyFileSync(sourcePath, backupPath);
      }
      for (const entry of jsonEntries) {
        const fileName = path__default.basename(entry.entryName);
        if (fileName !== entry.entryName) {
          ctx.logger.warn(`跳过包含路径遍历的文件: ${entry.entryName}`);
          continue;
        }
        const targetPath = path__default.join(dataPath, fileName);
        const content = entry.getData();
        fs__default.writeFileSync(targetPath, content);
      }
      pluginState.loadConfig();
      ctx.logger.info(`数据导入完成: ${importedFiles.length} 个文件`);
      res.json({
        code: 0,
        message: "导入成功",
        data: { importedFiles }
      });
    } catch (error) {
      ctx.logger.error("数据导入失败:", error);
      res.status(500).json({ code: -1, message: `导入失败: ${error}` });
    }
  });
  ctx.logger.debug("API 路由注册完成");
}

/**
 * NapCat 插件模板 - 主入口
 *
 * 导出 PluginModule 接口定义的生命周期函数，NapCat 加载插件时会调用这些函数。
 *
 * 生命周期：
 *   plugin_init        → 插件加载时调用（必选）
 *   plugin_onmessage   → 收到事件时调用（需通过 post_type 判断事件类型）
 *   plugin_onevent     → 收到所有 OneBot 事件时调用
 *   plugin_cleanup     → 插件卸载/重载时调用
 *
 * 配置相关：
 *   plugin_config_ui          → 导出配置 Schema，用于 WebUI 自动生成配置面板
 *   plugin_get_config         → 自定义配置读取
 *   plugin_set_config         → 自定义配置保存
 *   plugin_on_config_change   → 配置变更回调
 *
 * @author Your Name
 * @license MIT
 */
let plugin_config_ui = [];
const plugin_init = async (ctx) => {
  try {
    pluginState.init(ctx);
    ctx.logger.info("插件初始化中...");
    plugin_config_ui = buildConfigSchema(ctx);
    registerWebUI(ctx);
    registerApiRoutes(ctx);
    steamPollingService.startPolling();
    ctx.logger.info("插件初始化完成");
  } catch (error) {
    ctx.logger.error("插件初始化失败:", error);
  }
};
const plugin_onmessage = async (ctx, event) => {
  if (event.post_type !== EventType.MESSAGE) return;
  if (!pluginState.config.enabled) return;
  await handleMessage(ctx, event);
};
const plugin_onevent = async (ctx, event) => {
};
const plugin_cleanup = async (ctx) => {
  try {
    steamPollingService.stopPolling();
    pluginState.cleanup();
    ctx.logger.info("插件已卸载");
  } catch (e) {
    ctx.logger.warn("插件卸载时出错:", e);
  }
};
const plugin_get_config = async (ctx) => {
  return pluginState.config;
};
const plugin_set_config = async (ctx, config) => {
  pluginState.replaceConfig(config);
  ctx.logger.info("配置已通过 WebUI 更新");
};
const plugin_on_config_change = async (ctx, ui, key, value, currentConfig) => {
  try {
    const oldSteamApiKey = pluginState.config.steamApiKey;
    pluginState.updateConfig({ [key]: value });
    ctx.logger.debug(`配置项 ${key} 已更新`);
    if (key === "steamApiKey" && oldSteamApiKey !== value) {
      ctx.logger.info("检测到 Steam API Key 发生变化，正在重启轮询服务...");
      steamPollingService.stopPolling();
      steamPollingService.startPolling();
      ctx.logger.info("轮询服务已重启");
    }
  } catch (err) {
    ctx.logger.error(`更新配置项 ${key} 失败:`, err);
  }
};
function registerWebUI(ctx) {
  const router = ctx.router;
  router.static("/static", "webui");
  router.page({
    path: "dashboard",
    title: "插件仪表盘",
    htmlFile: "webui/index.html",
    description: "插件管理控制台"
  });
  ctx.logger.debug("WebUI 路由注册完成");
}

export { plugin_cleanup, plugin_config_ui, plugin_get_config, plugin_init, plugin_on_config_change, plugin_onevent, plugin_onmessage, plugin_set_config };
