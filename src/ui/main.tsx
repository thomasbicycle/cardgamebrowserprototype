import { render } from 'preact';
import { DayEnd, Morning, Show, Title } from './screens/Screens';
import { useStore } from './store';
import './styles.css';

function App() {
  const { game } = useStore();
  if (!game) return <Title />;
  if (game.phase === 'morning') return <Morning game={game} />;
  if (game.phase === 'show') return <Show game={game} />;
  return <DayEnd game={game} />;
}

render(<App />, document.getElementById('app')!);
