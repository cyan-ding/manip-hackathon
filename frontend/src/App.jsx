import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Traits from './pages/Traits'
import Extract from './pages/Extract'
import Eval from './pages/Eval'
import GenerateVector from './pages/GenerateVector'
import Projection from './pages/Projection'
import Playground from './pages/Playground'
import ModelComparison from './pages/ModelComparison'
import Jobs from './pages/Jobs'
import Results from './pages/Results'
import Vectors from './pages/Vectors'

function App() {
  return (
    <>
      <nav className="nav">
        <div className="nav-content">
          <div className="nav-title">Vex Reinforce</div>
          <ul className="nav-links">
            <li><NavLink to="/">Dashboard</NavLink></li>
            <li><NavLink to="/traits">Traits</NavLink></li>
            <li><NavLink to="/extract">Extract</NavLink></li>
            <li><NavLink to="/eval">Eval</NavLink></li>
            <li><NavLink to="/generate-vector">Generate Vector</NavLink></li>
            <li><NavLink to="/projection">Projection</NavLink></li>
            <li><NavLink to="/playground">Playground</NavLink></li>
            <li><NavLink to="/compare">Compare Models</NavLink></li>
            <li><NavLink to="/jobs">Jobs</NavLink></li>
            <li><NavLink to="/results">Results</NavLink></li>
            <li><NavLink to="/vectors">Vectors</NavLink></li>
          </ul>
        </div>
      </nav>

      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/traits" element={<Traits />} />
          <Route path="/extract" element={<Extract />} />
          <Route path="/eval" element={<Eval />} />
          <Route path="/generate-vector" element={<GenerateVector />} />
          <Route path="/projection" element={<Projection />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/compare" element={<ModelComparison />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/results" element={<Results />} />
          <Route path="/vectors" element={<Vectors />} />
        </Routes>
      </div>
    </>
  )
}

export default App
