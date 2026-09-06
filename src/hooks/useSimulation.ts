import { useEffect } from 'react'
import { useStore } from '@/store'
import { startSimulation, stopSimulation } from '@/simulation/engine'

export function useSimulation() {
  const { simRunning, isDemo } = useStore()

  useEffect(() => {
    if (isDemo) {
      startSimulation()
    }
    return () => {
      stopSimulation()
    }
  }, [isDemo])

  useEffect(() => {
    if (!simRunning) {
      stopSimulation()
    } else if (isDemo) {
      startSimulation()
    }
  }, [simRunning, isDemo])
}
