import * as React from "react"
import { Dimensions } from "react-native"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const { width } = Dimensions.get('window')
    setIsMobile(width < MOBILE_BREAKPOINT)
    
    const handleResize = () => {
      const { width } = Dimensions.get('window')
      setIsMobile(width < MOBILE_BREAKPOINT)
    }
    
    const subscription = Dimensions.addEventListener('change', handleResize)
    return () => subscription?.remove()
  }, [])

  return !!isMobile
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const { width } = Dimensions.get('window')
    setIsTablet(width >= MOBILE_BREAKPOINT && width < 1024)
    
    const handleResize = () => {
      const { width } = Dimensions.get('window')
      setIsTablet(width >= MOBILE_BREAKPOINT && width < 1024)
    }
    
    const subscription = Dimensions.addEventListener('change', handleResize)
    return () => subscription?.remove()
  }, [])

  return !!isTablet
}

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const { width } = Dimensions.get('window')
    setIsDesktop(width >= 1024)
    
    const handleResize = () => {
      const { width } = Dimensions.get('window')
      setIsDesktop(width >= 1024)
    }
    
    const subscription = Dimensions.addEventListener('change', handleResize)
    return () => subscription?.remove()
  }, [])

  return !!isDesktop
}
