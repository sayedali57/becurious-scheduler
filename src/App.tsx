import { useEffect } from 'react'

function App() {
  useEffect(() => {
    window.location.href = '/scheduler.html'
  }, [])

  return <p>Loading scheduler...</p>
}

export default App