

const a = `<svg width="400" height="88" viewBox="0 0 400 88"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink">
	<rect width="400" height="88" fill="#202227"/>
	<image x="12" y="12" width="64" height="64"
	       href="${ 'bindItem.face || change.newStatus.avatarmedium' }"
	       preserveAspectRatio="xMidYMid meet"/>
	<text x="84" y="36" font-family="sans-serif" font-size="20">
		<tspan fill="#cee8b1">${ 'change.newStatus.personaname' }</tspan>
		${ 'fromInfo.nickname' ? `<tspan dx="8" fill="#5e5e5e">(${ 'fromInfo.nickname' })</tspan>` : '' }
	</text>
	<text x="84" y="64" font-family="sans-serif" font-size="16" fill="#91c257">
		${ 'gameStatus' }
	</text>
</svg>`
const buffer = Buffer.from(a)
const base64 = buffer.toString('base64');
console.log(`base64://${base64}`);
