import type { AlignmentGroup } from "@sofia/core";
import type { MouseEvent } from "react";
import type { Side } from "./store";
import { useEditor } from "./store";

interface Props {
  side: Side;
  id: string;
  form: string;
  group: AlignmentGroup | undefined;
  selected: boolean;
  unverified?: boolean;
  analysed?: boolean;
  title?: string;
}

export function TokenChip({ side, id, form, group, selected, unverified, analysed, title }: Props) {
  const select = useEditor((s) => s.select);
  const hoverGroup = useEditor((s) => s.hoverGroup);
  const activeGroup = useEditor((s) => s.activeGroup);
  const setHoverGroup = useEditor((s) => s.setHoverGroup);
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    select(side, id, e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "replace");
  };
  const cls = [
    "tok",
    group ? `lbl-${group.label}` : side === "orig" ? "unaligned" : "",
    selected ? "selected" : "",
    group && hoverGroup === group.id ? "hover" : "",
    group && activeGroup === group.id ? "active" : "",
    unverified ? "unverified" : "",
    analysed === false && side === "orig" ? "unanalysed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      data-id={id}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHoverGroup(group?.id ?? null)}
      onMouseLeave={() => setHoverGroup(null)}
    >
      {form}
    </button>
  );
}
