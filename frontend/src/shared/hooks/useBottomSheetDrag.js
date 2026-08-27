import { useRef, useState } from "react";

const SHEET_PEEK_RATIO = 0.24;

function useBottomSheetDrag() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [liveDragY, setLiveDragY] = useState(null);
  const dragStateRef = useRef(null);

  const peekOffsetPx = () => window.innerHeight * SHEET_PEEK_RATIO;

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startY: event.clientY,
      baseline: isExpanded ? 0 : peekOffsetPx(),
    };
    setLiveDragY(dragStateRef.current.baseline);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current) return;
    const delta = event.clientY - dragStateRef.current.startY;
    const max = peekOffsetPx();
    setLiveDragY(Math.min(Math.max(dragStateRef.current.baseline + delta, 0), max));
  };

  const handlePointerUp = () => {
    if (!dragStateRef.current) return;
    const max = peekOffsetPx();
    setIsExpanded((liveDragY ?? dragStateRef.current.baseline) < max / 2);
    dragStateRef.current = null;
    setLiveDragY(null);
  };

  return {
    isExpanded,
    liveDragY,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

export default useBottomSheetDrag;
