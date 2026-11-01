type DepthTarget = {
  id: string;
  label: string;
};

type DepthMeterProps = {
  depthLabel: string;
  progress: number;
  targets: DepthTarget[];
  activeId: string;
  onJump: (id: string) => void;
};

export default function DepthMeter({
  depthLabel,
  progress,
  targets,
  activeId,
  onJump,
}: DepthMeterProps) {
  return (
    <aside className="descent-depth" aria-label="Depth">
      <div className="descent-mono" id="depth-label">
        {depthLabel}
      </div>
      <div className="descent-depth-bar">
        <i style={{ height: `${Math.round(progress * 100)}%` }} />
      </div>
      {targets.map((target) => (
        <button
          key={target.id}
          type="button"
          className={target.id === activeId ? "on" : ""}
          onClick={() => onJump(target.id)}
        >
          {target.label}
        </button>
      ))}
    </aside>
  );
}
