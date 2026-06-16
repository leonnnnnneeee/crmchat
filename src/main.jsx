import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.jsx"

class Boundary extends React.Component {
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  render(){
    if(this.state.err) return (
      <div style={{padding:40,color:"#e53935",fontFamily:"monospace",background:"#17212b",minHeight:"100vh"}}>
        <h2 style={{marginBottom:12}}>App Error</h2>
        <pre style={{fontSize:13,color:"#aaa",whiteSpace:"pre-wrap"}}>{this.state.err.toString()}</pre>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <Boundary><App/></Boundary>
)