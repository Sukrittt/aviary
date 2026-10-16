// The signed-in app's stylesheets, in cascade order: they share class names and
// expense-redesign.css has to win. Every app segment layout imports this first, so
// public pages (landing, content, legal) never download them; src/base.css is the
// part every page needs, loaded by the root layout.
import './App.css'
import './expense-redesign.css'
