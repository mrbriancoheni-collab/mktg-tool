import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useStore, type StageNode } from "../lib/store";

const COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa"];

function StickyNodeImpl({ id, data, selected }: NodeProps<StageNode>) {
  const update = useStore((s) => s.updateNode);
  const color = (data.color as string) ?? COLORS[0];
  return (
    <div className="sticky" style={{ background: color }}>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} lineClassName="sticky-resize" />
      <textarea
        className="nodrag nowheel"
        value={data.label}
        placeholder="Type an idea…"
        onChange={(e) => update(id, { label: e.target.value })}
      />
      {selected && (
        <div className="sticky-colors">
          {COLORS.map((c) => (
            <button key={c} style={{ background: c }} onClick={() => update(id, { color: c })} aria-label="Note color" />
          ))}
        </div>
      )}
    </div>
  );
}

export const StickyNode = memo(StickyNodeImpl);
