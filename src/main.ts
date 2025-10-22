import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import "cesium/Build/Cesium/Widgets/widgets.css";

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

export const cesiumToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhOTUxMTFmNi0zMjIxLTQ5NWQtOGY4OC1mOGU1NWJmOTcxMzMiLCJpZCI6MzI3MDA5LCJpYXQiOjE3NTM4Njk2MzN9.J9xTR4P5cKykyB7WqCNob8x2S_1Bo2vfJFpWPwPchwk'
const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
