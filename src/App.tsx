import { useRef, useSyncExternalStore } from 'react';
import { GameController } from './game/controller';
import { MenuScreen } from './ui/MenuScreen';
import { GameScreen } from './ui/GameScreen';

export default function App() {
  const ref = useRef<GameController | null>(null);
  if (!ref.current) ref.current = new GameController('browser');
  const c = ref.current;
  const state = useSyncExternalStore(c.subscribe, c.getState);
  if (state.phase === 'idle') return <MenuScreen c={c} />;
  return <GameScreen key="game" c={c} />;
}
