import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useGuestsStore = defineStore('guests', () => {
    // 選中的貴賓列表
    const selectedGuests = ref([])

    // 切換選中狀態
    const toggleGuest = (guest) => {
        const index = selectedGuests.value.findIndex(g => g.id === guest.id)
        if (index > -1) {
            selectedGuests.value.splice(index, 1)
        } else {
            selectedGuests.value.push(guest)
        }
    }

    // 檢查是否已選中
    const isGuestSelected = (guestId) => {
        return selectedGuests.value.some(g => g.id === guestId)
    }

    // 清空選中
    const clearSelectedGuests = () => {
        selectedGuests.value = []
    }

    // 獲取選中的貴賓列表
    const getSelectedGuests = computed(() => selectedGuests.value)

    return {
        selectedGuests,
        toggleGuest,
        isGuestSelected,
        clearSelectedGuests,
        getSelectedGuests
    }
})
