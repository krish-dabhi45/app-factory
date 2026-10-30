import 'package:connectivity_plus/connectivity_plus.dart';

Future<bool> checkConnectivity() async {
  List<ConnectivityResult> connectivityResult =
  await (Connectivity().checkConnectivity());
  if (connectivityResult.contains(ConnectivityResult.none)) {
    return false;
  } else if (connectivityResult.contains(ConnectivityResult.wifi) ||
      connectivityResult.contains( ConnectivityResult.mobile) ||
      connectivityResult.contains(ConnectivityResult.ethernet))  {
    return true;
  }
  return false;
}