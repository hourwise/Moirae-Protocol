import { Model } from "@strands-agents/sdk";
import type { BaseModelConfig, Message, ModelStreamEvent } from "@strands-agents/sdk";

import type { AgentProposalV1 } from "../../src/proposal.js";

export type MockProposalResolver = (request: string) => AgentProposalV1;

/**
 * Synthetic model for adapter tests. It speaks the real Strands model stream
 * protocol and emits the SDK's structured-output tool call, but never performs
 * inference or network I/O.
 */
export class SyntheticStructuredOutputModel extends Model {
  public callCount = 0;
  public readonly requests: string[] = [];

  private config: BaseModelConfig;

  public constructor(
    private readonly resolveProposal: MockProposalResolver,
    modelId = "mock/synthetic",
  ) {
    super();
    this.config = { modelId };
  }

  public updateConfig(modelConfig: BaseModelConfig): void {
    this.config = { ...this.config, ...modelConfig };
  }

  public getConfig(): BaseModelConfig {
    return this.config;
  }

  public async *stream(messages: Message[]): AsyncIterable<ModelStreamEvent> {
    this.callCount += 1;
    const request = [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.filter((block) => block.type === "textBlock")
      .map((block) => block.text)
      .join("\n");

    if (!request) {
      throw new Error("Synthetic model received no user request");
    }

    this.requests.push(request);
    const proposal = this.resolveProposal(request);
    const toolUseId = `mock-structured-output-${this.callCount}`;

    yield { type: "modelMessageStartEvent", role: "assistant" };
    yield {
      type: "modelContentBlockStartEvent",
      start: {
        type: "toolUseStart",
        name: "strands_structured_output",
        toolUseId,
      },
    };
    yield {
      type: "modelContentBlockDeltaEvent",
      delta: {
        type: "toolUseInputDelta",
        input: JSON.stringify(proposal),
      },
    };
    yield { type: "modelContentBlockStopEvent" };
    yield { type: "modelMessageStopEvent", stopReason: "toolUse" };
  }
}

export class SyntheticTextOnlyModel extends Model {
  public callCount = 0;
  private config: BaseModelConfig = { modelId: "mock/synthetic-text" };

  public updateConfig(modelConfig: BaseModelConfig): void {
    this.config = { ...this.config, ...modelConfig };
  }

  public getConfig(): BaseModelConfig {
    return this.config;
  }

  public async *stream(): AsyncIterable<ModelStreamEvent> {
    this.callCount += 1;
    yield { type: "modelMessageStartEvent", role: "assistant" };
    yield {
      type: "modelContentBlockDeltaEvent",
      delta: { type: "textDelta", text: "not structured output" },
    };
    yield { type: "modelContentBlockStopEvent" };
    yield { type: "modelMessageStopEvent", stopReason: "endTurn" };
  }
}
