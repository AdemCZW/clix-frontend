import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'

export const useParticipantsStore = defineStore('participants', () => {
    // 參與者數據列表
    const participants = reactive([
        {
            id: "001",
            name: "王小明",
            company: "文靜科技",
            title: "技術總監",
            phone: "0912-345-678",
            email: "wang@test.com",
            type: "VIP",
            status: "已報到",
        },
        {
            id: "002",
            name: "李大華",
            company: "創新設計",
            title: "設計師",
            phone: "0922-111-222",
            email: "lee@test.com",
            type: "一般民眾",
            status: "未報到",
        },
        {
            id: "003",
            name: "張美麗",
            company: "全球物流",
            title: "行銷經理",
            phone: "0933-444-555",
            email: "chang@test.com",
            type: "一般民眾",
            status: "已報到",
        },
    ])

    // 選中的特邀貴賓列表（用於報名頁面預覽）
    const selectedVIPs = ref([])

    // 新增參與者
    const addParticipant = (participant) => {
        participants.push(participant)
    }

    // 刪除參與者
    const deleteParticipant = (participant) => {
        const index = participants.indexOf(participant)
        if (index > -1) {
            participants.splice(index, 1)
            // 如果刪除的參與者在選中列表中，也要移除
            const selectedIndex = selectedVIPs.value.findIndex(p => p.id === participant.id)
            if (selectedIndex > -1) {
                selectedVIPs.value.splice(selectedIndex, 1)
            }
        }
    }

    // 匯入參與者
    const importParticipants = (newParticipants) => {
        participants.push(...newParticipants)
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

    // 清空選中
    const clearSelectedVIPs = () => {
        selectedVIPs.value = []
    }

    // 獲取選中的特邀貴賓列表
    const getSelectedVIPs = computed(() => selectedVIPs.value)

    return {
        participants,
        selectedVIPs,
        addParticipant,
        deleteParticipant,
        importParticipants,
        toggleVIP,
        isVIPSelected,
        clearSelectedVIPs,
        getSelectedVIPs
    }
})
