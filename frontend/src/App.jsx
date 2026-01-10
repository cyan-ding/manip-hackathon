import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Traits from './pages/Traits'
import Evaluate from './pages/Evaluate'
import GenerateVector from './pages/GenerateVector'
import Projection from './pages/Projection'
import Results from './pages/Results'
import Vectors from './pages/Vectors'

function App() {
  return (
    <>
      <nav className="nav">
        <div className="nav-content">
          <div className="nav-title">🎭 Persona Vectors</div>
          <ul className="nav-links">
            <li><NavLink to="/">Dashboard</NavLink></li>
            <li><NavLink to="/traits">Traits</NavLink></li>
            <li><NavLink to="/evaluate">Evaluate</NavLink></li>
            <li><NavLink to="/generate-vector">Generate Vector</NavLink></li>
            <li><NavLink to="/projection">Projection</NavLink></li>
            <li><NavLink to="/results">Results</NavLink></li>
            <li><NavLink to="/vectors">Vectors</NavLink></li>
          </ul>
        </div>
      </nav>

      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/traits" element={<Traits />} />
          <Route path="/evaluate" element={<Evaluate />} />
          <Route path="/generate-vector" element={<GenerateVector />} />
          <Route path="/projection" element={<Projection />} />
          <Route path="/results" element={<Results />} />
          <Route path="/vectors" element={<Vectors />} />
        </Routes>
      </div>
    </>
  )
}

export default App
