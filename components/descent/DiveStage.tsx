import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useRef } from "react";
import type { DiveStage as DiveStageData } from "@/lib/descent";

type DiveStageProps = {
  stage: DiveStageData;
  isHero?: boolean;
  video?: string;
  poster?: string;
  videoPaused?: boolean;
  videoRef?: RefObject<HTMLVideoElement>;
  onToggleVideo?: () => void;
  overlay?: ReactNode;
};

export default function DiveStage({
  stage,
  isHero = false,
  video,
  poster,
  videoPaused = false,
  videoRef,
  onToggleVideo,
  overlay,
}: DiveStageProps) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const handleTilt = (e: ReactMouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    if (tiltRef.current) {
      tiltRef.current.style.transform = `rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translate3d(${(x * 14).toFixed(1)}px, ${(y * 10).toFixed(1)}px, 0)`;
    }
  };
  const resetTilt = () => {
    if (tiltRef.current) tiltRef.current.style.transform = "";
  };
  return (
    <section
      className="descent-stage"
      id={stage.id}
      onMouseMove={isHero ? undefined : handleTilt}
      onMouseLeave={isHero ? undefined : resetTilt}
    >
      {isHero && video ? (
        <video
          ref={videoRef}
          className="descent-hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster={poster}
          data-paused={videoPaused}
        >
          <source src={video} type="video/mp4" />
        </video>
      ) : (
        <div ref={tiltRef} className="shark-3d-tilt">
          <img
            className="descent-stage-img shark-3d"
            src={stage.image}
            alt={stage.imageAlt}
          />
          <div className="shark-3d-shine" aria-hidden="true" />
        </div>
      )}
      {!isHero && <div className={`descent-dark ${stage.darkClass}`} />}
      <div className="descent-inner">
        {(stage.heading || stage.headingEm) && (
          <h1 className={isHero ? "" : "descent-h2"}>
            {stage.heading}
            {stage.heading && <br />}
            <em>{stage.headingEm}</em>
          </h1>
        )}
        {stage.body && <p>{stage.body}</p>}
        {stage.facts.length > 0 && (
          <div className="descent-data descent-mono">
            {stage.facts.map((fact) => (
              <div key={fact.label}>
                {fact.label}
                <span>
                  <b>{fact.value}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        {overlay ? <div className="descent-hero-model">{overlay}</div> : null}
      </div>
    </section>
  );
}
