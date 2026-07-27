import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
  }
  interface ActivityIndicatorProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
}
