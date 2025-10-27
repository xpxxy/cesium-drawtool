import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import "cesium/Build/Cesium/Widgets/widgets.css";

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

export const cesiumToken = ''
const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
