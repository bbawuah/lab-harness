"""Offline failure injection; never starts or signals a real process."""
from unittest.mock import patch,MagicMock
from pathlib import Path
import subprocess
import desktop_trial as desktop
from browser_trial import require_cleanup
for close,profiles in [({'exit':1},[]),({'exit':None},[]),({'exit':0},['owned-profile'])]:
 try: require_cleanup(close,profiles)
 except RuntimeError: pass
 else: raise AssertionError('Failed cleanup accepted')
require_cleanup({'exit':0},[])
root=MagicMock();root.glob.return_value=[Path('/private/tmp/fake-owned/host/s.sock')]
replies=[subprocess.TimeoutExpired('fixture',20),subprocess.CompletedProcess([],0,'456\n',''),subprocess.CompletedProcess([],0,str(desktop.CACHE/'desktop/agent-desktop'),'')]
with patch.object(desktop.tempfile,'mkdtemp',return_value='/private/tmp/fake-owned'),patch.object(desktop,'Path',return_value=root),patch.object(desktop,'clean_env',return_value={}),patch.object(desktop.subprocess,'run',side_effect=replies),patch.object(desktop.os,'kill',side_effect=[None,ProcessLookupError()]) as kill,patch.object(desktop,'save') as save,patch.object(desktop.shutil,'rmtree') as remove:
 try: desktop.main()
 except subprocess.TimeoutExpired: pass
 else: raise AssertionError('Timeout swallowed')
 assert kill.call_count==2
 assert save.call_args.args[1]['cleanupVerified'] is True
 remove.assert_called_once_with(root)
print('Cleanup failure-path checks passed; real processes started/signalled: 0')
