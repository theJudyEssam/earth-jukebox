# Haptics add-on (phase 3 starter)

The web app already sends a pulse for every beat of the sonification. Phase 3 turns those pulses into something you can feel, such as a wristband or a pad under the hand, for deaf and deafblind users.

## Protocol (USB serial, 115200 baud)

One line per pulse:

```
P <intensity 0-255> <duration ms>\n
```

`P 0 0` means stop. Intensity follows the data value under the crosshair, and tempo follows it too: faster pulses mean higher values. Over the ocean, a slow, soft swell arrives every couple of seconds.

## Minimal Arduino sketch (one ERM vibration motor)

Wire the motor through an NPN transistor or MOSFET (with a flyback diode) to PWM pin 9.

```cpp
const int MOTOR = 9;
unsigned long offAt = 0;

void setup() { pinMode(MOTOR, OUTPUT); Serial.begin(115200); }

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    int i, ms;
    if (sscanf(line.c_str(), "P %d %d", &i, &ms) == 2) {
      analogWrite(MOTOR, constrain(i, 0, 255));
      offAt = millis() + ms;
    }
  }
  if (offAt && millis() > offAt) { analogWrite(MOTOR, 0); offAt = 0; }
}
```

Then click **Connect haptic device** in the app (Chrome or Edge desktop) and pick the board.

## Ideas for later

- Use several motors for spatial haptics: map the left, centre and right voices to left and right motors.
- Use an LRA motor with a DRV2605L driver for crisper, tunable taps.
- Use Bluetooth LE instead of USB so it works on phones (add a `BleDriver` next to the serial writer in `src/haptics/haptics.js`).
