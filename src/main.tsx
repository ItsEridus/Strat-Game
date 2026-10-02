import { render } from 'preact';
import { App } from './ui/App';
import { store } from './ui/store';

const root = document.getElementById('app')!;
root.innerHTML = '';
render(<App />, root);
// Debug/automation handle (used by the browser smoke test; harmless in play).
(window as any).meridian = store;
