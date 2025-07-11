import { streamGenerateContent } from "../../../gemini-api-client/gemini-api-client.ts"
import { resultHelper } from "../../../gemini-api-client/response-helper.ts"
import type { FunctionCall } from "../../../gemini-api-client/types.ts"
import type { Logger } from "../../../log.ts"
import type { OpenAI } from "../../../types.ts"
import { type ApiParam, genModel } from "../../../utils.ts"

export async function nonStreamingChatProxyHandler(
  req: OpenAI.Chat.ChatCompletionCreateParams,
  apiParam: ApiParam,
  log?: Logger,
): Promise<Response> {
  const [model, geminiReq] = genModel(req)
  let geminiResp: string | FunctionCall = ""

  try {
    for await (const it of streamGenerateContent(apiParam, model, geminiReq)) {
      const data = resultHelper(it)
      if (typeof data === "string") {
        geminiResp += data
      } else {
        geminiResp = data
        break
      }
    }
  } catch (err) {
    // 出现异常时打印请求参数和响应，以便调试
    log?.error(req)
    log?.error(err?.message ?? err.toString())
    geminiResp = err?.message ?? err.toString()
  }

  log?.debug(req)
  log?.debug(geminiResp)

  function genOpenAiResp(content: string | FunctionCall): OpenAI.Chat.ChatCompletion {
    if (typeof content === "string") {
      return {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model.model,
        choices: [
          {
            message: { role: "assistant", content: content, refusal: null },
            finish_reason: "stop",
            index: 0,
            logprobs: null,
          },
        ],
      }
    }

    return {
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.model,
      choices: [
        {
          message: {
            role: "assistant",
            refusal: null,
            content: "", // ИЗМЕНЕНО: теперь пустая строка вместо null
            function_call: {
              name: content.name ?? "",
              arguments: JSON.stringify(content.args),
            },
          },
          finish_reason: "function_call",
          index: 0,
          logprobs: null,
        },
      ],
    }
  }

  return Response.json(genOpenAiResp(geminiResp))
}
