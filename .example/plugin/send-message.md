# 发送消息

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /send_msg:
    post:
      summary: 发送消息
      deprecated: false
      description: 发送私聊或群聊消息
      tags:
        - OpenAPI/消息接口
        - 消息接口
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                message_type:
                  description: 消息类型 (private/group)
                  enum:
                    - private
                    - group
                  type: string
                user_id:
                  description: 用户QQ
                  type: string
                group_id:
                  description: 群号
                  type: string
                message:
                  $ref: '#/components/schemas/OB11MessageMixType'
                auto_escape:
                  description: 是否作为纯文本发送
                  anyOf:
                    - type: boolean
                    - type: string
                source:
                  description: 合并转发来源
                  type: string
                news:
                  description: 合并转发新闻
                  type: array
                  items:
                    type: object
                    properties:
                      text:
                        type: string
                    required:
                      - text
                    x-apifox-orders:
                      - text
                    x-apifox-ignore-properties: []
                summary:
                  description: 合并转发摘要
                  type: string
                prompt:
                  description: 合并转发提示
                  type: string
              required:
                - message
              x-apifox-orders:
                - message_type
                - user_id
                - group_id
                - message
                - auto_escape
                - source
                - news
                - summary
                - prompt
              x-apifox-ignore-properties: []
            examples:
              Default:
                value:
                  message_type: group
                  group_id: '123456'
                  message: hello
                summary: 默认请求示例
      responses:
        '200':
          description: 业务响应
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/BaseResponse'
                  - type: object
                    required:
                      - data
                    properties:
                      data:
                        type: object
                        properties:
                          message_id:
                            description: 消息ID
                            type: number
                          res_id:
                            description: 转发消息的 res_id
                            type: string
                          forward_id:
                            description: 转发消息的 forward_id
                            type: string
                        required:
                          - message_id
                        description: 业务数据
                        x-apifox-orders:
                          - message_id
                          - res_id
                          - forward_id
                        x-apifox-ignore-properties: []
                    x-apifox-orders:
                      - data
                    x-apifox-ignore-properties: []
              examples:
                Success:
                  summary: 成功响应
                  value:
                    status: ok
                    retcode: 0
                    data:
                      message_id: 123456
                    message: ''
                    wording: ''
                    stream: normal-action
                Error_1400:
                  summary: 请求参数错误或业务逻辑执行失败
                  value:
                    status: failed
                    retcode: 1400
                    data: null
                    message: 请求参数错误或业务逻辑执行失败
                    wording: 请求参数错误或业务逻辑执行失败
                    stream: normal-action
                Error_1401:
                  summary: 权限不足
                  value:
                    status: failed
                    retcode: 1401
                    data: null
                    message: 权限不足
                    wording: 权限不足
                    stream: normal-action
                Error_1404:
                  summary: 资源不存在
                  value:
                    status: failed
                    retcode: 1404
                    data: null
                    message: 资源不存在
                    wording: 资源不存在
                    stream: normal-action
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: OpenAPI/消息接口
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/5348325/apis/api-226656652-run
components:
  schemas:
    OB11MessageMixType:
      x-schema-id: OB11MessageMixType
      description: OneBot 11 消息混合类型
      anyOf:
        - type: array
          items: &ref_0
            $ref: '#/components/schemas/OB11MessageData'
        - type: string
        - *ref_0
      x-apifox-folder: ''
    OB11MessageData:
      x-schema-id: OB11MessageData
      description: OneBot 11 消息段
      anyOf:
        - $ref: '#/components/schemas/OB11MessageText'
        - $ref: '#/components/schemas/OB11MessageFace'
        - $ref: '#/components/schemas/OB11MessageMFace'
        - $ref: '#/components/schemas/OB11MessageAt'
        - $ref: '#/components/schemas/OB11MessageReply'
        - $ref: '#/components/schemas/OB11MessageImage'
        - $ref: '#/components/schemas/OB11MessageRecord'
        - $ref: '#/components/schemas/OB11MessageVideo'
        - $ref: '#/components/schemas/OB11MessageFile'
        - $ref: '#/components/schemas/OB11MessageIdMusic'
        - $ref: '#/components/schemas/OB11MessageCustomMusic'
        - $ref: '#/components/schemas/OB11MessagePoke'
        - $ref: '#/components/schemas/OB11MessageDice'
        - $ref: '#/components/schemas/OB11MessageRPS'
        - $ref: '#/components/schemas/OB11MessageContact'
        - $ref: '#/components/schemas/OB11MessageLocation'
        - $ref: '#/components/schemas/OB11MessageJson'
        - $ref: '#/components/schemas/OB11MessageXml'
        - $ref: '#/components/schemas/OB11MessageMarkdown'
        - $ref: '#/components/schemas/OB11MessageMiniApp'
        - $ref: '#/components/schemas/OB11MessageNode'
        - $ref: '#/components/schemas/OB11MessageForward'
        - $ref: '#/components/schemas/OB11MessageOnlineFile'
        - $ref: '#/components/schemas/OB11MessageFlashTransfer'
      x-apifox-folder: ''
    OB11MessageFlashTransfer:
      x-schema-id: OB11MessageFlashTransfer
      description: QQ闪传消息段
      type: object
      properties:
        type:
          enum:
            - flashtransfer
          type: string
        data:
          type: object
          properties:
            fileSetId:
              description: 文件集ID
              type: string
          required:
            - fileSetId
          x-apifox-orders:
            - fileSetId
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageOnlineFile:
      x-schema-id: OB11MessageOnlineFile
      description: 在线文件消息段
      type: object
      properties:
        type:
          enum:
            - onlinefile
          type: string
        data:
          type: object
          properties:
            msgId:
              description: 消息ID
              type: string
            elementId:
              description: 元素ID
              type: string
            fileName:
              description: 文件名
              type: string
            fileSize:
              description: 文件大小
              type: string
            isDir:
              description: 是否为目录
              type: boolean
          required:
            - msgId
            - elementId
            - fileName
            - fileSize
            - isDir
          x-apifox-orders:
            - msgId
            - elementId
            - fileName
            - fileSize
            - isDir
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageForward:
      x-schema-id: OB11MessageForward
      description: 合并转发消息段
      type: object
      properties:
        type:
          enum:
            - forward
          type: string
        data:
          type: object
          properties:
            id:
              description: 合并转发ID
              type: string
            content:
              description: 消息内容 (OB11Message[])
              type: object
              x-apifox-orders: []
              properties: {}
              x-apifox-ignore-properties: []
          required:
            - id
          x-apifox-orders:
            - id
            - content
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageNode:
      x-schema-id: OB11MessageNode
      description: 合并转发消息节点
      type: object
      properties:
        type:
          enum:
            - node
          type: string
        data:
          type: object
          properties:
            id:
              description: 转发消息ID
              type: string
            user_id:
              description: 发送者QQ号
              anyOf:
                - type: number
                - type: string
            uin:
              description: 发送者QQ号(兼容go-cqhttp)
              anyOf:
                - type: number
                - type: string
            nickname:
              description: 发送者昵称
              type: string
            name:
              description: 发送者昵称(兼容go-cqhttp)
              type: string
            content:
              description: 消息内容 (OB11MessageMixType)
              type: object
              x-apifox-orders: []
              properties: {}
              x-apifox-ignore-properties: []
            source:
              description: 消息来源
              type: string
            news:
              type: array
              items:
                type: object
                properties:
                  text:
                    description: 新闻文本
                    type: string
                required:
                  - text
                x-apifox-orders:
                  - text
                x-apifox-ignore-properties: []
            summary:
              description: 摘要
              type: string
            prompt:
              description: 提示
              type: string
            time:
              description: 时间
              type: string
          required:
            - nickname
            - content
          x-apifox-orders:
            - id
            - user_id
            - uin
            - nickname
            - name
            - content
            - source
            - news
            - summary
            - prompt
            - time
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageMiniApp:
      x-schema-id: OB11MessageMiniApp
      description: 小程序消息段
      type: object
      properties:
        type:
          enum:
            - miniapp
          type: string
        data:
          type: object
          properties:
            data:
              description: 小程序数据
              type: string
          required:
            - data
          x-apifox-orders:
            - data
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageMarkdown:
      x-schema-id: OB11MessageMarkdown
      description: Markdown消息段
      type: object
      properties:
        type:
          enum:
            - markdown
          type: string
        data:
          type: object
          properties:
            content:
              description: Markdown内容
              type: string
          required:
            - content
          x-apifox-orders:
            - content
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageXml:
      x-schema-id: OB11MessageXml
      description: XML消息段
      type: object
      properties:
        type:
          enum:
            - xml
          type: string
        data:
          type: object
          properties:
            data:
              description: XML数据
              type: string
          required:
            - data
          x-apifox-orders:
            - data
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageJson:
      x-schema-id: OB11MessageJson
      description: JSON消息段
      type: object
      properties:
        type:
          enum:
            - json
          type: string
        data:
          type: object
          properties:
            data:
              description: JSON数据
              anyOf:
                - type: string
                - type: object
                  properties: {}
                  x-apifox-orders: []
                  x-apifox-ignore-properties: []
            config:
              type: object
              properties:
                token:
                  description: token
                  type: string
              required:
                - token
              x-apifox-orders:
                - token
              x-apifox-ignore-properties: []
          required:
            - data
          x-apifox-orders:
            - data
            - config
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageLocation:
      x-schema-id: OB11MessageLocation
      description: 位置消息段
      type: object
      properties:
        type:
          enum:
            - location
          type: string
        data:
          type: object
          properties:
            lat:
              description: 纬度
              anyOf:
                - type: string
                - type: number
            lon:
              description: 经度
              anyOf:
                - type: string
                - type: number
            title:
              description: 标题
              type: string
            content:
              description: 内容
              type: string
          required:
            - lat
            - lon
          x-apifox-orders:
            - lat
            - lon
            - title
            - content
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageContact:
      x-schema-id: OB11MessageContact
      description: 联系人消息段
      type: object
      properties:
        type:
          enum:
            - contact
          type: string
        data:
          type: object
          properties:
            type:
              description: 联系人类型
              enum:
                - qq
                - group
              type: string
            id:
              description: 联系人ID
              type: string
          required:
            - type
            - id
          x-apifox-orders:
            - type
            - id
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageRPS:
      x-schema-id: OB11MessageRPS
      description: 猜拳消息段
      type: object
      properties:
        type:
          enum:
            - rps
          type: string
        data:
          type: object
          properties:
            result:
              description: 猜拳结果
              anyOf:
                - type: number
                - type: string
          required:
            - result
          x-apifox-orders:
            - result
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageDice:
      x-schema-id: OB11MessageDice
      description: 骰子消息段
      type: object
      properties:
        type:
          enum:
            - dice
          type: string
        data:
          type: object
          properties:
            result:
              description: 骰子结果
              anyOf:
                - type: number
                - type: string
          required:
            - result
          x-apifox-orders:
            - result
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessagePoke:
      x-schema-id: OB11MessagePoke
      description: 戳一戳消息段
      type: object
      properties:
        type:
          enum:
            - poke
          type: string
        data:
          type: object
          properties:
            type:
              description: 戳一戳类型
              type: string
            id:
              description: 戳一戳ID
              type: string
          required:
            - type
            - id
          x-apifox-orders:
            - type
            - id
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageCustomMusic:
      x-schema-id: OB11MessageCustomMusic
      description: 自定义音乐消息段
      type: object
      properties:
        type:
          enum:
            - music
          type: string
        data:
          type: object
          properties:
            type:
              description: 音乐平台类型
              enum:
                - qq
                - '163'
                - kugou
                - migu
                - kuwo
                - custom
              type: string
            id:
              type: 'null'
            url:
              description: 点击后跳转URL
              type: string
            audio:
              description: 音频URL
              type: string
            title:
              description: 音乐标题
              type: string
            image:
              description: 封面图片URL
              type: string
            content:
              description: 音乐简介
              type: string
          required:
            - type
            - id
            - url
            - image
          x-apifox-orders:
            - type
            - id
            - url
            - audio
            - title
            - image
            - content
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageIdMusic:
      x-schema-id: OB11MessageIdMusic
      description: ID音乐消息段
      type: object
      properties:
        type:
          enum:
            - music
          type: string
        data:
          type: object
          properties:
            type:
              description: 音乐平台类型
              enum:
                - qq
                - '163'
                - kugou
                - migu
                - kuwo
              type: string
            id:
              description: 音乐ID
              anyOf:
                - type: string
                - type: number
          required:
            - type
            - id
          x-apifox-orders:
            - type
            - id
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageFile:
      x-schema-id: OB11MessageFile
      description: 文件消息段
      type: object
      properties:
        type:
          enum:
            - file
          type: string
        data: &ref_1
          $ref: '#/components/schemas/FileBaseData'
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    FileBaseData:
      x-schema-id: FileBaseData
      description: 文件消息段基础数据
      type: object
      properties:
        file:
          description: 文件路径/URL/file:///
          type: string
        path:
          description: 文件路径
          type: string
        url:
          description: 文件URL
          type: string
        name:
          description: 文件名
          type: string
        thumb:
          description: 缩略图
          type: string
      required:
        - file
      x-apifox-orders:
        - file
        - path
        - url
        - name
        - thumb
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageVideo:
      x-schema-id: OB11MessageVideo
      description: 视频消息段
      type: object
      properties:
        type:
          enum:
            - video
          type: string
        data: *ref_1
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageRecord:
      x-schema-id: OB11MessageRecord
      description: 语音消息段
      type: object
      properties:
        type:
          enum:
            - record
          type: string
        data: *ref_1
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageImage:
      x-schema-id: OB11MessageImage
      description: 图片消息段
      type: object
      properties:
        type:
          enum:
            - image
          type: string
        data:
          allOf:
            - *ref_1
            - type: object
              properties:
                summary:
                  description: 图片摘要
                  type: string
                sub_type:
                  description: 图片子类型
                  type: number
              x-apifox-orders:
                - summary
                - sub_type
              x-apifox-ignore-properties: []
          x-apifox-orders: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageReply:
      x-schema-id: OB11MessageReply
      description: 回复消息段
      type: object
      properties:
        type:
          enum:
            - reply
          type: string
        data:
          type: object
          properties:
            id:
              description: 消息ID的短ID映射
              type: string
            seq:
              description: 消息序列号，优先使用
              type: number
          x-apifox-orders:
            - id
            - seq
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageAt:
      x-schema-id: OB11MessageAt
      description: '@消息段'
      type: object
      properties:
        type:
          enum:
            - at
          type: string
        data:
          type: object
          properties:
            qq:
              description: QQ号或all
              type: string
            name:
              description: 显示名称
              type: string
          required:
            - qq
          x-apifox-orders:
            - qq
            - name
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageMFace:
      x-schema-id: OB11MessageMFace
      description: 商城表情消息段
      type: object
      properties:
        type:
          enum:
            - mface
          type: string
        data:
          type: object
          properties:
            emoji_package_id:
              description: 表情包ID
              type: number
            emoji_id:
              description: 表情ID
              type: string
            key:
              description: 表情key
              type: string
            summary:
              description: 表情摘要
              type: string
          required:
            - emoji_package_id
            - emoji_id
            - key
            - summary
          x-apifox-orders:
            - emoji_package_id
            - emoji_id
            - key
            - summary
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageFace:
      x-schema-id: OB11MessageFace
      description: QQ表情消息段
      type: object
      properties:
        type:
          enum:
            - face
          type: string
        data:
          type: object
          properties:
            id:
              description: 表情ID
              type: string
            resultId:
              description: 结果ID
              type: string
            chainCount:
              description: 连击数
              type: number
          required:
            - id
          x-apifox-orders:
            - id
            - resultId
            - chainCount
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    OB11MessageText:
      x-schema-id: OB11MessageText
      description: 纯文本消息段
      type: object
      properties:
        type:
          enum:
            - text
          type: string
        data:
          type: object
          properties:
            text:
              description: 纯文本内容
              type: string
          required:
            - text
          x-apifox-orders:
            - text
          x-apifox-ignore-properties: []
      required:
        - type
        - data
      x-apifox-orders:
        - type
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
    BaseResponse:
      type: object
      x-schema-id: BaseResponse
      properties:
        status:
          type: string
          description: 状态 (ok/failed)
        retcode:
          type: number
          description: 返回码
        data:
          type: string
        message:
          type: string
          description: 消息
        wording:
          type: string
          description: 提示
        stream:
          type: string
          description: 流式响应
          enum:
            - stream-action
            - normal-action
      required:
        - status
        - retcode
      x-apifox-orders:
        - status
        - retcode
        - data
        - message
        - wording
        - stream
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
  securitySchemes:
    api_key:
      type: apikey
      name: api_key
      in: header
    petstore_auth:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://petstore.swagger.io/oauth/authorize
          scopes:
            read:pets: read your pets
            write:pets: modify pets in your account
servers: []
security: []

```
