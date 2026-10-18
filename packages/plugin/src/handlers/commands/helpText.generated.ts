/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/steam-help.ts
 */

import type { HelpVariant } from '../../utils/helpMessage';

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
export const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: "【Steam 在线状态监听帮助】\n\n状态查询:\n#steam help: 显示本帮助\n#steam search <昵称或链接>: 查询 Steam ID64 [仅群聊]\n#steam list: 列出当前群绑定的 Steam 用户 [仅群聊]\n#steam report today: 生成今日活动报告 [仅群聊]\n#steam report yesterday: 生成昨日活动报告 [仅群聊]\n\n绑定管理:\n#steam bind <Steam ID> [昵称]: 绑定一个 Steam 用户到当前群 [仅群聊]\n#steam bind-batch <Steam ID> <昵称> ...: 批量绑定多个 Steam 用户 [仅群聊]\n#steam remove <Steam ID>: 移除当前群对该 Steam 用户的绑定 [仅群聊]\n",
    admin: "【Steam 在线状态监听帮助】\n\n状态查询:\n#steam help: 显示本帮助\n#steam search <昵称或链接>: 查询 Steam ID64 [仅群聊]\n#steam list: 列出当前群绑定的 Steam 用户 [仅群聊]\n#steam report today: 生成今日活动报告 [仅群聊]\n#steam report yesterday: 生成昨日活动报告 [仅群聊]\n\n绑定管理:\n#steam bind <Steam ID> [昵称]: 绑定一个 Steam 用户到当前群 [仅群聊]\n#steam bind-batch <Steam ID> <昵称> ...: 批量绑定多个 Steam 用户 [仅群聊]\n#steam remove <Steam ID>: 移除当前群对该 Steam 用户的绑定 [仅群聊]\n\n群管理指令 [管理员]:\n#steam reset: 清空当前群的全部 Steam 绑定 [仅群聊]\n",
    superAdmin: "【Steam 在线状态监听帮助】\n\n状态查询:\n#steam help: 显示本帮助\n#steam search <昵称或链接>: 查询 Steam ID64 [仅群聊]\n#steam list: 列出当前群绑定的 Steam 用户 [仅群聊]\n#steam report today: 生成今日活动报告 [仅群聊]\n#steam report yesterday: 生成昨日活动报告 [仅群聊]\n\n绑定管理:\n#steam bind <Steam ID> [昵称]: 绑定一个 Steam 用户到当前群 [仅群聊]\n#steam bind-batch <Steam ID> <昵称> ...: 批量绑定多个 Steam 用户 [仅群聊]\n#steam remove <Steam ID>: 移除当前群对该 Steam 用户的绑定 [仅群聊]\n\n群管理指令 [管理员]:\n#steam reset: 清空当前群的全部 Steam 绑定 [仅群聊]\n\n插件管理指令 [超管]:\n#steam polling: 手动触发一次 Steam 状态轮询 [仅私聊]\n#steam group add <群号>: 将群聊加入白名单 [仅私聊]\n#steam group remove <群号>: 将群聊移出白名单 [仅私聊]\n#steam group list: 查看已启用的群聊列表 [仅私聊]\n#steam admin list: 查看超级管理员列表 [仅私聊]\n#steam admin add <QQ号>: 添加超级管理员 [仅私聊]\n#steam admin remove <QQ号>: 移除超级管理员 [仅私聊]\n",
};
