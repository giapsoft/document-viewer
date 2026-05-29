import { WelcomeScreen } from './components/WelcomeScreen';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { useAppStore } from './hooks/useAppStore';

function App() {
  const store = useAppStore();

  if (!store.state.project) {
    return <WelcomeScreen onLoaded={store.setProject} />;
  }

  return <ProjectWorkspace store={store} />;
}

export default App;
