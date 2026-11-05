import { useEffect } from "react";

/**
 * Summary: Set the browser title for the active page.
 * Parameters: title is a non-null page label.
 * Return Value: None.
 * Side Effects & Constraints: React effect updates document.title when title changes; requires a
 * browser document.
 */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · LeaveFlowSE`;
  }, [title]);
}
