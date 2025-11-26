#__init__.py
# Copyright (c) 2025 Melbourne Instruments. All Rights Reserved.
#
# This script is provided "as is", without any warranty of any kind, express or
# implied, including but not limited to the warranties of merchantability,
# fitness for a particular purpose, and noninfringement. In no event shall the
# authors or copyright holders be liable for any claim, damages, or other
# liability, whether in an action of contract, tort, or otherwise, arising from,
# out of, or in connection with the software or the use or other dealings in the
# software.
from __future__ import absolute_import, print_function, unicode_literals
from .ROTO_CONTROL import RotoControl

def create_instance(c_instance):
    return RotoControl(c_instance)
