export class AgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInputError";
  }
}

export class AgentCallerAbortedError extends Error {
  constructor() {
    super("The caller disconnected before the agent request completed.");
    this.name = "AgentCallerAbortedError";
  }
}

export class AgentProviderError extends Error {
  constructor() {
    super("The provider request failed.");
    this.name = "AgentProviderError";
  }
}

export class AgentInvalidOutputError extends Error {
  readonly rawOutput?: string;
  inputTokens?: number;
  outputTokens?: number;

  constructor(message = "The model response did not match the expected format.", rawOutput?: string) {
    super(message);
    this.name = "AgentInvalidOutputError";
    this.rawOutput = rawOutput?.slice(0, 20_000);
  }
}

export class AgentRefusalError extends Error {
  inputTokens?: number;
  outputTokens?: number;

  constructor() {
    super("The model declined to produce an interface.");
    this.name = "AgentRefusalError";
  }
}

export class AgentDeadlineError extends Error {
  constructor() {
    super("The agent request exceeded its time limit.");
    this.name = "AgentDeadlineError";
  }
}
