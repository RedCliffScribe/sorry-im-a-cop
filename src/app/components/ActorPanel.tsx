import { getVisibleActors } from '../../domain/runtime/selectors';
import type { RuntimeState } from '../../domain/runtime/types';

export function ActorPanel({ state }: { state: RuntimeState }) {
  const actors = getVisibleActors(state).filter((actor) => actor.actorId !== state.player.actorId);

  return (
    <section className="panel" aria-label="人物">
      <h2>人物</h2>
      <ul className="actor-list">
        {actors.map((actor) => (
          <li key={actor.actorId}>
            <strong>{actor.name}</strong>
            <span>{actor.presence}</span>
            <small>往来度 {actor.interactionScore}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
