import { go } from '../lib.js';
import { LargeTitle, List, Row } from '../components/ui.jsx';

const SUB = { '/reports': 'Morning brief and evening report for every day', '/backtest': 'Test the rules on years of history', '/agents': 'What each agent is doing, daily routine, log', '/overrule': 'Buy what the agents skipped, keep positions longer, block stocks', '/settings': 'Trading, capital, buying & selling rules, Zerodha, notifications, app' };
const TONES = ['butter', 'peach', 'sky', 'coral', 'lav'];

export default function More({ nav }) {
  return (
    <div>
      <LargeTitle title="More" />
      <List>
        {nav.map((n, i) => (
          <Row key={n.path} title={n.label} subtitle={SUB[n.path]} icon={n.icon} iconTone={TONES[i]} chevron onClick={() => go(n.path)} />
        ))}
      </List>
    </div>
  );
}
