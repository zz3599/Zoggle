/// <reference lib="webworker" />

import { handleFreshBoardRequest } from "./fresh-board-worker-core";
import type { FreshBoardResponse } from "./fresh-board";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener(
  "message",
  (event: MessageEvent<unknown>) => {
    const response: FreshBoardResponse = handleFreshBoardRequest(event.data);
    workerScope.postMessage(response);
  },
);
