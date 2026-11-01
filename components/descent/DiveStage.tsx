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
      <div className={`descent-dark ${stage.darkClass}`} />
      <div className="descent-inner">
        <div className="descent-meta descent-mono">
          <span>{stage.label}</span>
          <span>{stage.light}</span>
        </div>
        <h1 className={isHero ? "" : "descent-h2"}>
          {stage.heading}
          <br />
          <em>{stage.headingEm}</em>
        </h1>
        <p>{stage.body}</p>
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
        {overlay ? <div className="descent-hero-model">{overlay}</div> : null}
        {isHero && onToggleVideo ? (
          <div className="descent-scroll-cue">
            <span />
            <span className="descent-mono">Scroll — sink</span>
            <button
              type="button"
              className="descent-video-btn"
              onClick={onToggleVideo}
            >
              {videoPaused ? "▶ Play video" : "⏸ Pause video"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
