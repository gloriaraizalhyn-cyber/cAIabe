import { BrowserRouter } from "react-router-dom";
import AppRouter from "./router/AppRouter.jsx";
import DemoFrameBootstrap from "./demo/DemoFrameBootstrap.jsx";

function App() {
  return (
    <BrowserRouter>
      {/* No-op unless the URL carries ?demoAs= — see DemoFrameBootstrap. It
          wraps the router rather than sitting inside a route because the
          driver frame has to be signed in before ANY driver page mounts. */}
      <DemoFrameBootstrap>
        <AppRouter />
      </DemoFrameBootstrap>
    </BrowserRouter>
  );
}

export default App;
