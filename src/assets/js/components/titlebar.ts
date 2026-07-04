class LivechatTitlebar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
      <div class="titlebar" data-tauri-drag-region>
        <span class="titlebar-brand">
            <img src="/assets/img/logo.png" alt="Splatt Logo" class="logo"/>
            Splatt 
            <span class="badge">by 111418</span>
         </span>
        <div class="titlebar-controls">
          <button id="tb-minimize">─</button>
          <button id="tb-maximize">☐</button>
          <button id="tb-close">✕</button>
        </div>
      </div>
    `
    this.querySelector('#tb-minimize')!.addEventListener('click', async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().minimize()
    })
    this.querySelector('#tb-maximize')!.addEventListener('click', async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().toggleMaximize()
    })
    this.querySelector('#tb-close')!.addEventListener('click', async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().close()
    })
    }
}

customElements.define('livechat-titlebar', LivechatTitlebar)