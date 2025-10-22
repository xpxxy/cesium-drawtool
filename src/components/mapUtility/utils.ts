import * as Cesium from "cesium"
import type { ZoneType } from "./types"

import { v4 as uuidv4 } from "uuid"

//配色方案
export const greenZone = {
	backgroundColor: Cesium.Color.fromCssColorString("rgba(33,206,144,0.4)"),
	outlineColor: Cesium.Color.fromCssColorString("#21CE90"),
}

export const yellowZone = {
	backgroundColor: Cesium.Color.fromCssColorString("rgba(255,161,20,0.4)"),
	outlineColor: Cesium.Color.fromCssColorString("#FFA114"),
}

export const redZone = {
	backgroundColor: Cesium.Color.fromCssColorString("rgba(249,109,85,0.4)"),
	outlineColor: Cesium.Color.fromCssColorString("#F96D55"),
}

export const greenLabel = {
	backgroundColor: Cesium.Color.fromCssColorString("#113529"),
	textOutline: Cesium.Color.fromCssColorString("#13A972"),
}
export const yellowLabel = {
	backgroundColor: Cesium.Color.fromCssColorString("#a1670fff"),
	textOutline: Cesium.Color.fromCssColorString("#FFA114"),
}
export const redLabel = {
	backgroundColor: Cesium.Color.fromCssColorString("#b14d3bff"),
	textOutline: Cesium.Color.fromCssColorString("#F96D55"),
}


export const regularDot = {
	color: Cesium.Color.fromCssColorString("#005294"),
	outlineColor: Cesium.Color.WHITE,
}

export const editDot = {
	color: Cesium.Color.fromCssColorString("#EB872A"),
	outlineColor: Cesium.Color.WHITE,
}









/**
 * @description: WGS84坐标转Cesium.Cartesian3
 * @param {number} longitude 经度
 * @param {number} latitude 纬度
 * @param {number} height 高度{可选，默认0}
 * @return {Cesium.Cartesian3} Cesium.Cartesian3 坐标
 */
export function Wgs84ToCartesian3(
	longitude: number,
	latitude: number,
	height: number = 0
): Cesium.Cartesian3 {
	return Cesium.Cartesian3.fromDegrees(longitude, latitude, height)
}

/**
 * @description: 将Cesium.Cartesian3坐标转换为WGS84坐标 高度信息可能有
 * @param {Cesium} cartesian
 * @return {Array<number>} [经度, 纬度, 高度?]
 */
export function Cartesian3ToWgs84(cartesian: Cesium.Cartesian3): [number, number, number?] {
	const carto = Cesium.Cartographic.fromCartesian(cartesian)
	return [
		Cesium.Math.toDegrees(carto.longitude),
		Cesium.Math.toDegrees(carto.latitude),
		carto.height,
	]
}

/**
 * @description: 创建并返回一个随机的id
 * @param {string} prefix
 * @return {*}
 */
export function getRandomId(prefix: string = ""): string {
	return prefix + uuidv4()
}

export function distanceInMeters(a: Cesium.Cartesian3, b: Cesium.Cartesian3): number {
	const c1 = Cesium.Cartographic.fromCartesian(a)
	const c2 = Cesium.Cartographic.fromCartesian(b)
	if (!c1 || !c2) return Cesium.Cartesian3.distance(a, b)
	const geo = new Cesium.EllipsoidGeodesic(c1, c2)
	return geo.surfaceDistance // 更接近地表距离
}

export function midpoint(a: Cesium.Cartesian3, b: Cesium.Cartesian3): Cesium.Cartesian3 {
	return Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3())
}

export function addEdgeLabels(
	viewer: Cesium.Viewer,
	points: Cesium.Cartesian3[],
	type: ZoneType,
	targetPolygon: Cesium.Entity
): Cesium.Entity[] {
	//把label与多边形绑定
	if (targetPolygon._edgeLables) {
		targetPolygon._edgeLables.forEach((label: Cesium.Entity) => viewer.entities.remove(label))
	}
	targetPolygon._edgeLables = []
	const labels: Cesium.Entity[] = []
	if (points.length < 2) return labels
	for (let i = 0; i < points.length; i++) {
		const a = points[i]
		const b = points[(i + 1) % points.length]
		const d = distanceInMeters(a, b)
		const pos = midpoint(a, b)
		const label = createLabel(viewer, pos, `${d.toFixed(1)} m`, type)
		labels.push(label)
		//与多边形绑定
		targetPolygon._edgeLables.push(label)
	}
	return labels
}

export function getZoneStyle(type: ZoneType) {
	switch (type) {
		case "workZone":
			return greenZone
		case "limitZone":
			return yellowZone
		case "forbidZone":
			return redZone
		default:
			return greenZone
	}
}

export function getZoneLabelStyle(type: ZoneType) {
	switch (type) {
		case "workZone":
			return greenLabel
		case "limitZone":
			return yellowLabel
		case "forbidZone":
			return redLabel
		default:
			return greenLabel
	}
}


export function getDotStyle(isEditable?: boolean){
	return isEditable ? editDot : regularDot
}