import type { ReactNode, RefObject } from "react";
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
  return (
    <section className="descent-stage" id={stage.id}>
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
        <img
          className="descent-stage-img"
          src={stage.image}
          alt={stage.imageAlt}
        />
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
