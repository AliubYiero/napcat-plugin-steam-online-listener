import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import ToastContainer from './components/ToastContainer'
import StatusPage from './pages/StatusPage'
import ConfigPage from './pages/ConfigPage'
import GroupsPage from './pages/GroupsPage'
import SteamManagementPage from './pages/SteamManagementPage'
import GameNamesPage from './pages/GameNamesPage'
import { useStatus } from './hooks/useStatus'
import { useTheme } from './hooks/useTheme'

export type PageId = 'status' | 'config' | 'groups' | 'steam' | 'gameNames'

const pageConfig: Record<PageId, { title: string; desc: string }> = {
    status: { title: '仪表盘', desc: '插件运行状态与数据概览' },
    config: { title: '插件配置', desc: '基础设置与参数配置' },
    groups: { title: '群管理', desc: '管理群的启用与禁用' },
    steam: { title: 'Steam 管理', desc: '管理 Steam 用户绑定' },
    gameNames: { title: '游戏名管理', desc: '管理游戏中英文名称' }
}

function App() {
    const [currentPage, setCurrentPage] = useState<PageId>('status')
    const [isScrolled, setIsScrolled] = useState(false)
    const { status, fetchStatus } = useStatus()

    useTheme()

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [fetchStatus])

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        setIsScrolled(e.currentTarget.scrollTop > 10)
    }

    const renderPage = () => {
        switch (currentPage) {
            case 'status': return <StatusPage status={status} onRefresh={fetchStatus} />
            case 'config': return <ConfigPage />
            case 'groups': return <GroupsPage />
            case 'steam': return <SteamManagementPage />
            case 'gameNames': return <GameNamesPage />
            default: return <StatusPage status={status} onRefresh={fetchStatus} />
        }
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#f8f9fa] dark:bg-[#18191C] text-gray-800 dark:text-gray-200 transition-colors duration-300">
            <ToastContainer />
            <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                    <Header
                        title={pageConfig[currentPage].title}
                        description={pageConfig[currentPage].desc}
                        isScrolled={isScrolled}
                        status={status}
                        currentPage={currentPage}
                    />
                    <div className="px-4 md:px-8 pb-8">
                        <div key={currentPage} className="page-enter">
                            {renderPage()}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

export default App
