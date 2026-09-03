import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  type RefObject,
} from "react";

import { SelectionController } from "../selection";
import type { Coordinate } from "../types";

interface UseSelectionControllerOptions {
  readonly boardRef: RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  readonly isCellAvailable: (coordinate: Coordinate) => boolean;
  readonly onPathChange: (path: readonly Coordinate[]) => void;
  readonly onSubmit: (path: readonly Coordinate[]) => void;
  readonly resetKey: number;
}

/** Connect the imperative pointer-capture lifecycle to a rendered board. */
export function useSelectionController({
  boardRef,
  enabled,
  isCellAvailable,
  onPathChange,
  onSubmit,
  resetKey,
}: UseSelectionControllerOptions): () => void {
  const controllerRef = useRef<SelectionController>(null);
  const getEnabled = useEffectEvent(() => enabled);
  const checkCellAvailable = useEffectEvent(isCellAvailable);
  const notifyPathChange = useEffectEvent(onPathChange);
  const submit = useEffectEvent(onSubmit);

  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    const controller = new SelectionController(boardElement, {
      isEnabled: getEnabled,
      isCellAvailable: checkCellAvailable,
      onPathChange: notifyPathChange,
      onSubmit: submit,
    });
    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [boardRef, resetKey]);

  useEffect(() => {
    if (!enabled) controllerRef.current?.cancel();
  }, [enabled]);

  return useCallback(() => controllerRef.current?.cancel(), []);
}
