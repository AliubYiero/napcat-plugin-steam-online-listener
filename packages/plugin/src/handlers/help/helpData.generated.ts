/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/
 * 供 WebUI 帮助文档页消费 (GET /help)
 */

import type { Cmd } from 'shared';

/** 全部帮助面板 (内容为各 cmds 权威源原样, 未经权限过滤) */
export const HELP_PANELS: Cmd[] = [
    {
        "id": "steam-help",
        "title": "Steam 在线状态监听帮助",
        "cmd": [
            {
                "groupName": "状态查询",
                "instructions": [
                    {
                        "cmd": "#steam help",
                        "desc": "显示本帮助"
                    },
                    {
                        "cmd": "#steam search <昵称或链接>",
                        "desc": "查询 Steam ID64",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#steam list",
                        "desc": "列出当前群绑定的 Steam 用户",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#steam report today",
                        "desc": "生成今日活动报告",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#steam report yesterday",
                        "desc": "生成昨日活动报告",
                        "onlyGroup": true
                    }
                ]
            },
            {
                "groupName": "绑定管理",
                "instructions": [
                    {
                        "cmd": "#steam bind <Steam ID> [昵称]",
                        "desc": "绑定一个 Steam 用户到当前群",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#steam bind-batch <Steam ID> <昵称> ...",
                        "desc": "批量绑定多个 Steam 用户",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#steam remove <Steam ID>",
                        "desc": "移除当前群对该 Steam 用户的绑定",
                        "onlyGroup": true
                    }
                ]
            },
            {
                "groupName": "群管理指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#steam reset",
                        "desc": "清空当前群的全部 Steam 绑定",
                        "onlyGroup": true
                    }
                ]
            },
            {
                "groupName": "插件管理指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#steam polling",
                        "desc": "手动触发一次 Steam 状态轮询",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam group add <群号>",
                        "desc": "将群聊加入白名单",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam group remove <群号>",
                        "desc": "将群聊移出白名单",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam group list",
                        "desc": "查看已启用的群聊列表",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam admin list",
                        "desc": "查看超级管理员列表",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam admin add <QQ号>",
                        "desc": "添加超级管理员",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#steam admin remove <QQ号>",
                        "desc": "移除超级管理员",
                        "onlyPrivate": true
                    }
                ]
            }
        ]
    }
];
