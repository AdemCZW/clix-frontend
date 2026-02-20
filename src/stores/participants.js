import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'

export const useParticipantsStore = defineStore('participants', () => {
    // 參與者數據列表
    const participants = reactive([])

    // 選中的特邀貴賓列表（用於報名頁面預覽）
    const selectedVIPs = ref([])

    // 報到紀錄
    const checkInLogs = reactive([])

    // 加載狀態
    const isLoading = ref(false)
    const error = ref(null)

    // ========== API 方法 ==========

    // 獲取所有參與者
    const fetchParticipants = async() => {
        isLoading.value = true
        error.value = null
        try {
            const response = await apiRequest('/api/participants/')
            if (!response.ok) throw new Error('獲取參與者資料失敗')
            const data = await response.json()

            // 清空並重新填充 participants
            participants.splice(0, participants.length)
            participants.push(...(data.results || data))
        } catch (err) {
            error.value = err.message
            console.error('Error fetching participants:', err)
        } finally {
            isLoading.value = false
        }
    }

    // 新增參與者（API）
    const addParticipant = async(participant) => {
        isLoading.value = true
        error.value = null
        try {
            const response = await apiRequest('/api/participants/', {
                method: 'POST',
                body: JSON.stringify(participant)
            })
            if (!response.ok) {
                const errorData = await response.json()
                console.error('Backend error:', errorData)
                throw new Error(JSON.stringify(errorData))
            }
            const newParticipant = await response.json()
            participants.push(newParticipant)
            return newParticipant
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    // 更新參與者（API）
    const updateParticipant = async(participantId, updates) => {
        isLoading.value = true
        error.value = null
        try {
            const response = await apiRequest(`/api/participants/${participantId}/`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            })
            if (!response.ok) throw new Error('更新參與者失敗')
            const updatedParticipant = await response.json()

            // 更新本地數據
            const index = participants.findIndex(p => p.id === participantId)
            if (index > -1) {
                Object.assign(participants[index], updatedParticipant)
            }
            return updatedParticipant
        } catch (err) {
            error.value = err.message
            console.error('Error updating participant:', err)
            throw err
        } finally {
            isLoading.value = false
        }
    }

    // 刪除參與者（API）
    const deleteParticipant = async(participant) => {
        isLoading.value = true
        error.value = null
        try {
            const response = await apiRequest(`/api/participants/${participant.id}/`, {
                method: 'DELETE'
            })
            if (!response.ok) throw new Error('刪除參與者失敗')

            // 從本地數據中移除
            const index = participants.indexOf(participant)
            if (index > -1) {
                participants.splice(index, 1)
            }

            // 如果在選中列表中，也要移除
            const selectedIndex = selectedVIPs.value.findIndex(p => p.id === participant.id)
            if (selectedIndex > -1) {
                selectedVIPs.value.splice(selectedIndex, 1)
            }
        } catch (err) {
            error.value = err.message
            console.error('Error deleting participant:', err)
            throw err
        } finally {
            isLoading.value = false
        }
    }

    // 匯入參與者（批量新增 - 使用後端批量 API）
    const importParticipants = async(newParticipants) => {
        isLoading.value = true
        error.value = null

        try {
            const response = await apiRequest('/api/participants/bulk_import_hybrid/', {
                method: 'POST',
                body: JSON.stringify({ participants: newParticipants })
            })

            const result = await response.json()

            // 根據不同模式處理結果
            if (result.mode === 'bulk') {
                // 批量模式：全部成功
                if (result.data) {
                    participants.push(...result.data)
                }
                return {
                    success: result.count,
                    failed: 0,
                    mode: 'bulk',
                    message: result.message
                }
            } else if (result.mode === 'partial') {
                // 部分模式：有成功有失敗
                if (result.data) {
                    participants.push(...result.data)
                }
                return {
                    success: result.success_count,
                    failed: result.error_count,
                    mode: 'partial',
                    errors: result.errors,
                    message: `成功 ${result.success_count} 筆，失敗 ${result.error_count} 筆`
                }
            }

            return { success: 0, failed: newParticipants.length }
        } catch (err) {
            error.value = err.message
            console.error('Error importing participants:', err)
            throw err
        } finally {
            isLoading.value = false
        }
    }

    // 切換選中狀態
    const toggleVIP = (participant) => {
        const index = selectedVIPs.value.findIndex(p => p.id === participant.id)
        if (index > -1) {
            selectedVIPs.value.splice(index, 1)
        } else {
            selectedVIPs.value.push(participant)
        }
    }

    // 檢查是否已選中
    const isVIPSelected = (participantId) => {
        return selectedVIPs.value.some(p => p.id === participantId)
    }

    // 報到（呼叫 POST /api/participants/{id}/check_in/）
    const checkIn = async(participantId) => {
        try {
            const response = await apiRequest(`/api/participants/${participantId}/check_in/`, {
                method: 'POST'
            })
            if (!response.ok) throw new Error('報到操作失敗')
            const updatedParticipant = await response.json()

            // 同步本地狀態
            const index = participants.findIndex(p => p.id === participantId)
            if (index > -1) {
                Object.assign(participants[index], updatedParticipant)
            }

            // 新增報到紀錄
            const p = participants[index] || updatedParticipant
            const now = new Date()
            checkInLogs.unshift({
                id: Date.now(),
                name: p.name,
                time: now.toLocaleTimeString(),
                method: 'manual',
                seat: p.seat || '現場安排',
                type: p.type || '一般民眾',
            })
            return true
        } catch (err) {
            error.value = err.message
            throw err
        }
    }

    // 取消報到（呼叫 POST /api/participants/{id}/check_out/）
    const checkOut = async(participantId) => {
        try {
            const response = await apiRequest(`/api/participants/${participantId}/check_out/`, {
                method: 'POST'
            })
            if (!response.ok) throw new Error('取消報到失敗')
            const updatedParticipant = await response.json()

            const index = participants.findIndex(p => p.id === participantId)
            if (index > -1) {
                Object.assign(participants[index], updatedParticipant)
            }
            return true
        } catch (err) {
            error.value = err.message
            throw err
        }
    }

    // 取得統計資料（呼叫 GET /api/participants/statistics/）
    const fetchStatistics = async() => {
        try {
            const response = await apiRequest('/api/participants/statistics/')
            if (!response.ok) throw new Error('取得統計資料失敗')
            return await response.json()
                // 回傳: { total, vip_count, general_count, checked_in, not_checked_in }
        } catch (err) {
            console.error('Error fetching statistics:', err)
            return null
        }
    }

    // 統計數據（本地計算，作為備用）
    const stats = computed(() => {
        const total = participants.length
        const checkedIn = participants.filter(p => p.status === '已報到').length
        const pending = total - checkedIn
        return { total, checkedIn, pending }
    })

    // 清空選中的貴賓
    const clearSelectedVIPs = () => {
        selectedVIPs.value = []
    }

    // 取得選中的貴賓
    const getSelectedVIPs = () => {
        return selectedVIPs.value
    }

    return {
        participants,
        selectedVIPs,
        checkInLogs,
        isLoading,
        error,
        fetchParticipants,
        addParticipant,
        updateParticipant,
        deleteParticipant,
        importParticipants,
        toggleVIP,
        isVIPSelected,
        clearSelectedVIPs,
        getSelectedVIPs,
        checkIn,
        checkOut,
        fetchStatistics,
        stats
    }
})
