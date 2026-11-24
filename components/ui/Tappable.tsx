import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type TappableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
};

/**
 * A Pressable whose style may depend on `pressed`.
 *
 * NativeWind (react-native-css-interop) wraps Pressable and drops a style written as a
 * function, so `style={({ pressed }) => [...]}` renders with no style at all on device
 * (no border, no background, no row layout). This keeps the pressed state itself and
 * always hands Pressable a plain style.
 */
export function Tappable({ style, onPressIn, onPressOut, ...rest }: TappableProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={typeof style === 'function' ? style({ pressed }) : style}
    />
  );
}
