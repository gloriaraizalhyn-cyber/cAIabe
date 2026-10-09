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
    const { baseline } = dragStateRef.current;
    const finalY = liveDragY ?? baseline;
    if (Math.abs(finalY - baseline) < 6) {
      // A tap on the handle toggles the sheet.
      setIsExpanded(!isExpanded);
    } else if (isExpanded) {
      // Pulling down only closes it once it has been dragged a little way.
      setIsExpanded(finalY < max * 0.15);
    } else {
      // Pulling up opens it after roughly the first sixth of the travel,
      // instead of needing to cross the halfway point.
      setIsExpanded(finalY < max * 0.85);
    }
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

