import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,color:'#ef4444',fontFamily:'monospace',background:'#0d0d12',minHeight:'100vh'}}>
        <h2>App Error</h2>
        <pre style={{marginTop:12,fontSize:12,color:'#f0f0f8'}}>{this.state.error.toString()}</pre>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
